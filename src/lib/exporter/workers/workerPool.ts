/**
 * Worker Pool Manager
 * Manages multiple render workers for parallel frame processing
 * Inspired by Remotion's Lambda concurrency model
 */

export interface WorkerTask<T = unknown> {
  id: number;
  data: T;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

export interface PooledWorker {
  worker: Worker;
  busy: boolean;
  currentTask: WorkerTask | null;
  completedTasks: number;
}

export interface WorkerPoolConfig {
  maxWorkers: number;
  workerScript: string;
  initData?: unknown;
}

/**
 * Generic worker pool for parallel task execution
 */
export class WorkerPool<TInput = unknown, TOutput = unknown> {
  private workers: PooledWorker[] = [];
  private taskQueue: WorkerTask<TInput>[] = [];
  private taskIdCounter = 0;
  private isInitialized = false;
  private config: WorkerPoolConfig;
  private onTaskComplete?: (result: TOutput, taskId: number) => void;

  constructor(config: WorkerPoolConfig) {
    this.config = config;
  }

  /**
   * Initialize all workers in the pool
   */
  async initialize(initData?: unknown): Promise<void> {
    if (this.isInitialized) return;

    const initPromises: Promise<void>[] = [];

    for (let i = 0; i < this.config.maxWorkers; i++) {
      const worker = new Worker(
        new URL(this.config.workerScript, import.meta.url),
        { type: 'module' }
      );

      const pooledWorker: PooledWorker = {
        worker,
        busy: false,
        currentTask: null,
        completedTasks: 0,
      };

      this.workers.push(pooledWorker);

      // Setup message handler
      worker.onmessage = (event) => this.handleWorkerMessage(pooledWorker, event);
      worker.onerror = (error) => this.handleWorkerError(pooledWorker, error);

      // Initialize worker if needed
      if (initData || this.config.initData) {
        initPromises.push(
          new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Worker init timeout')), 10000);
            
            const initHandler = (event: MessageEvent) => {
              if (event.data.type === 'initialized') {
                clearTimeout(timeout);
                worker.removeEventListener('message', initHandler);
                resolve();
              }
            };
            
            worker.addEventListener('message', initHandler);
            worker.postMessage({ type: 'init', ...(initData || this.config.initData) });
          })
        );
      }
    }

    await Promise.all(initPromises);
    this.isInitialized = true;
    console.log(`[WorkerPool] Initialized ${this.config.maxWorkers} workers`);
  }

  /**
   * Submit a task to the pool
   */
  submitTask(data: TInput): Promise<TOutput> {
    return new Promise((resolve, reject) => {
      const task: WorkerTask<TInput> = {
        id: this.taskIdCounter++,
        data,
        resolve: resolve as (result: unknown) => void,
        reject,
      };

      this.taskQueue.push(task);
      this.processQueue();
    });
  }

  /**
   * Submit multiple tasks and return results in order
   */
  async submitTasksBatch(tasks: TInput[]): Promise<TOutput[]> {
    const promises = tasks.map(data => this.submitTask(data));
    return Promise.all(promises);
  }

  /**
   * Set callback for task completion
   */
  onComplete(callback: (result: TOutput, taskId: number) => void): void {
    this.onTaskComplete = callback;
  }

  /**
   * Process pending tasks
   */
  private processQueue(): void {
    for (const pooledWorker of this.workers) {
      if (!pooledWorker.busy && this.taskQueue.length > 0) {
        const task = this.taskQueue.shift()!;
        this.assignTask(pooledWorker, task);
      }
    }
  }

  /**
   * Assign a task to a worker
   */
  private assignTask(pooledWorker: PooledWorker, task: WorkerTask<TInput>): void {
    pooledWorker.busy = true;
    pooledWorker.currentTask = task;
    
    // Send task to worker with transferable objects if available
    const message = { type: 'render', ...task.data };
    const transferables = this.getTransferables(task.data);
    
    if (transferables.length > 0) {
      pooledWorker.worker.postMessage(message, transferables);
    } else {
      pooledWorker.worker.postMessage(message);
    }
  }

  /**
   * Extract transferable objects from task data
   */
  private getTransferables(data: TInput): Transferable[] {
    const transferables: Transferable[] = [];
    
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if (obj.frameData instanceof ArrayBuffer) {
        transferables.push(obj.frameData);
      }
      if (obj.bitmap instanceof ImageBitmap) {
        transferables.push(obj.bitmap);
      }
    }
    
    return transferables;
  }

  /**
   * Handle message from worker
   */
  private handleWorkerMessage(pooledWorker: PooledWorker, event: MessageEvent): void {
    const { data } = event;

    if (data.type === 'frameComplete' || data.type === 'result') {
      const task = pooledWorker.currentTask;
      if (task) {
        task.resolve(data);
        pooledWorker.completedTasks++;
        
        if (this.onTaskComplete) {
          this.onTaskComplete(data as TOutput, task.id);
        }
      }
      
      pooledWorker.busy = false;
      pooledWorker.currentTask = null;
      this.processQueue();
    } else if (data.type === 'error') {
      const task = pooledWorker.currentTask;
      if (task) {
        task.reject(new Error(data.error || 'Unknown worker error'));
      }
      
      pooledWorker.busy = false;
      pooledWorker.currentTask = null;
      this.processQueue();
    }
  }

  /**
   * Handle worker error
   */
  private handleWorkerError(pooledWorker: PooledWorker, error: ErrorEvent): void {
    console.error('[WorkerPool] Worker error:', error);
    
    const task = pooledWorker.currentTask;
    if (task) {
      task.reject(new Error(error.message || 'Worker error'));
    }
    
    pooledWorker.busy = false;
    pooledWorker.currentTask = null;
    this.processQueue();
  }

  /**
   * Get pool statistics
   */
  getStats(): { total: number; busy: number; idle: number; queued: number; completed: number } {
    const busy = this.workers.filter(w => w.busy).length;
    const completed = this.workers.reduce((sum, w) => sum + w.completedTasks, 0);
    
    return {
      total: this.workers.length,
      busy,
      idle: this.workers.length - busy,
      queued: this.taskQueue.length,
      completed,
    };
  }

  /**
   * Wait for all pending tasks to complete
   */
  async drain(): Promise<void> {
    while (this.taskQueue.length > 0 || this.workers.some(w => w.busy)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Terminate all workers
   */
  async terminate(): Promise<void> {
    // Wait for pending tasks
    await this.drain();

    // Send destroy message to all workers
    const destroyPromises = this.workers.map(pooledWorker => {
      return new Promise<void>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data.type === 'destroyed') {
            pooledWorker.worker.removeEventListener('message', handler);
            resolve();
          }
        };
        pooledWorker.worker.addEventListener('message', handler);
        pooledWorker.worker.postMessage({ type: 'destroy' });
        
        // Timeout fallback
        setTimeout(resolve, 1000);
      });
    });

    await Promise.all(destroyPromises);

    // Terminate workers
    for (const pooledWorker of this.workers) {
      pooledWorker.worker.terminate();
    }

    this.workers = [];
    this.taskQueue = [];
    this.isInitialized = false;
    console.log('[WorkerPool] All workers terminated');
  }
}

/**
 * Calculate optimal worker count based on hardware
 */
export function calculateOptimalWorkerCount(
  resolution: { width: number; height: number }
): number {
  const cores = navigator.hardwareConcurrency || 4;
  const pixels = resolution.width * resolution.height;
  const megapixels = pixels / 1_000_000;

  // Scale workers based on resolution and available cores
  // Higher resolution = fewer workers to avoid memory pressure
  let workers: number;

  if (megapixels > 8) {
    // 4K+: Use fewer workers
    workers = Math.max(2, Math.floor(cores * 0.25));
  } else if (megapixels > 2) {
    // 1080p-4K: Moderate workers
    workers = Math.max(2, Math.floor(cores * 0.5));
  } else {
    // Below 1080p: More workers
    workers = Math.max(2, Math.floor(cores * 0.75));
  }

  // Cap at 8 workers max
  return Math.min(workers, 8);
}
