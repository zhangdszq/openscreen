/// <reference path="./node_modules/@figma/plugin-typings/index.d.ts" />
/**
 * OpenScreen Flow Importer - Figma Plugin
 *
 * Imports flow graphs exported from OpenScreen into Figma/FigJam.
 */
// Plugin UI configuration
figma.showUI(__html__, {
    width: 340,
    height: 380,
    themeColors: true
});
// Handle messages from UI
figma.ui.onmessage = async (msg) => {
    switch (msg.type) {
        case 'import-flow':
            await handleImportFlow(msg.flowData, msg.images);
            break;
        case 'show-error':
            figma.notify(msg.message, { error: true });
            break;
        case 'close':
            figma.closePlugin();
            break;
    }
};
/**
 * Main import handler
 */
async function handleImportFlow(flowData, images) {
    try {
        sendProgress(5, '准备导入...');
        // Load required fonts
        sendProgress(10, '加载字体...');
        await loadFonts();
        // Create the flow graph
        sendProgress(20, '创建流程图...');
        const result = await createFlowGraph(flowData, images);
        // Success
        figma.ui.postMessage({
            type: 'import-complete',
            keyframeCount: flowData.keyframes.length,
            connectionCount: flowData.connections.length
        });
        figma.notify(`✅ 导入成功: ${flowData.keyframes.length} 个关键帧`);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : '未知错误';
        console.error('Import error:', err);
        figma.ui.postMessage({ type: 'import-error', error: message });
        figma.notify(`导入失败: ${message}`, { error: true });
    }
}
/**
 * Send progress update to UI
 */
function sendProgress(percent, text) {
    figma.ui.postMessage({ type: 'progress', percent, text });
}
/**
 * Load required fonts
 */
async function loadFonts() {
    const fonts = [
        { family: 'Inter', style: 'Regular' },
        { family: 'Inter', style: 'Medium' },
        { family: 'Inter', style: 'Semi Bold' }
    ];
    for (const font of fonts) {
        try {
            await figma.loadFontAsync(font);
        }
        catch (e) {
            // Fallback to system font
            console.log(`Font ${font.family} ${font.style} not available`);
        }
    }
}
/**
 * Create the flow graph in Figma
 */
async function createFlowGraph(flowData, images) {
    const { keyframes, connections, layout, projectName } = flowData;
    // Calculate dimensions
    const nodeWidth = (layout && layout.nodeWidth) ? layout.nodeWidth : 200;
    const nodeHeight = (layout && layout.nodeHeight) ? layout.nodeHeight : 140;
    const padding = 80;
    // Find bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const kf of keyframes) {
        minX = Math.min(minX, kf.position.x);
        minY = Math.min(minY, kf.position.y);
        maxX = Math.max(maxX, kf.position.x + nodeWidth);
        maxY = Math.max(maxY, kf.position.y + nodeHeight);
    }
    const canvasWidth = Math.max((maxX - minX) + padding * 2, 600);
    const canvasHeight = Math.max((maxY - minY) + padding * 2, 400);
    const offsetX = -minX + padding;
    const offsetY = -minY + padding;
    // Check if we're in FigJam - nodes should be directly on canvas for draggability
    const isFigJam = figma.editorType === 'figjam';
    sendProgress(25, '创建画布...');
    // In FigJam: place nodes directly on canvas; In Figma: use a container frame
    let mainFrame = null;
    let containerParent = figma.currentPage;
    if (!isFigJam) {
        // Regular Figma: use a frame container
        mainFrame = figma.createFrame();
        mainFrame.name = projectName || '竞品分析流程图';
        mainFrame.resize(canvasWidth, canvasHeight);
        mainFrame.fills = [{
                type: 'SOLID',
                color: { r: 0.97, g: 0.97, b: 0.98 }
            }];
        mainFrame.cornerRadius = 16;
        containerParent = mainFrame;
        // Create title inside frame
        const title = figma.createText();
        title.characters = projectName || '竞品分析流程图';
        title.fontSize = 20;
        try {
            title.fontName = { family: 'Inter', style: 'Semi Bold' };
        }
        catch (e) {
            title.fontName = { family: 'Inter', style: 'Medium' };
        }
        title.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
        title.x = 24;
        title.y = 20;
        mainFrame.appendChild(title);
    }
    else {
        // FigJam: create a sticky note as title
        try {
            const sticky = figma.createSticky();
            sticky.text.characters = projectName || '竞品分析流程图';
            sticky.x = offsetX;
            sticky.y = offsetY - 100;
        }
        catch (e) {
            // Fallback: just use text
            const title = figma.createText();
            title.characters = projectName || '竞品分析流程图';
            title.fontSize = 24;
            title.x = offsetX;
            title.y = offsetY - 50;
            figma.currentPage.appendChild(title);
        }
    }
    // Store node references for connections
    const nodeMap = {};
    const allNodes = [];
    // Create keyframe nodes
    for (let i = 0; i < keyframes.length; i++) {
        const kf = keyframes[i];
        const percent = 30 + Math.round((i / keyframes.length) * 40);
        sendProgress(percent, `创建节点 ${i + 1}/${keyframes.length}...`);
        const node = await createKeyframeNode(kf, images[kf.id], nodeWidth, nodeHeight);
        if (isFigJam) {
            // FigJam: place directly on canvas with absolute positions
            node.x = kf.position.x + offsetX;
            node.y = kf.position.y + offsetY;
            figma.currentPage.appendChild(node);
        }
        else {
            // Figma: place inside frame with relative positions
            node.x = kf.position.x + offsetX;
            node.y = kf.position.y + offsetY + 50; // Offset for title
            containerParent.appendChild(node);
        }
        nodeMap[kf.id] = node;
        allNodes.push(node);
    }
    // Create connections
    sendProgress(75, '创建连接线...');
    for (let i = 0; i < connections.length; i++) {
        const conn = connections[i];
        const fromNode = nodeMap[conn.from];
        const toNode = nodeMap[conn.to];
        if (fromNode && toNode) {
            if (isFigJam) {
                // FigJam: pass null as parent, connection goes directly to page
                await createConnection(null, fromNode, toNode, conn.label);
            }
            else {
                await createConnection(mainFrame, fromNode, toNode, conn.label);
            }
        }
    }
    // Position viewport
    sendProgress(95, '完成...');
    if (mainFrame) {
        figma.currentPage.appendChild(mainFrame);
        figma.viewport.scrollAndZoomIntoView([mainFrame]);
    }
    else {
        figma.viewport.scrollAndZoomIntoView(allNodes);
    }
    return { mainFrame, nodeCount: keyframes.length };
}
/**
 * Create a single keyframe node
 */
async function createKeyframeNode(kf, imageData, width, height) {
    const labelHeight = 32;
    const imageHeight = height - labelHeight;
    // Create container
    const frame = figma.createFrame();
    frame.name = kf.label || '关键帧';
    frame.resize(width, height);
    frame.cornerRadius = 8;
    frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    frame.effects = [{
            type: 'DROP_SHADOW',
            color: { r: 0, g: 0, b: 0, a: 0.1 },
            offset: { x: 0, y: 2 },
            radius: 8,
            spread: 0,
            visible: true,
            blendMode: 'NORMAL'
        }];
    frame.clipsContent = true;
    // Add image
    if (imageData && imageData.length > 0) {
        try {
            const uint8Array = new Uint8Array(imageData);
            const image = figma.createImage(uint8Array);
            const imageRect = figma.createRectangle();
            imageRect.name = 'screenshot';
            imageRect.x = 0;
            imageRect.y = 0;
            imageRect.resize(width, imageHeight);
            imageRect.fills = [{
                    type: 'IMAGE',
                    imageHash: image.hash,
                    scaleMode: 'FILL'
                }];
            frame.appendChild(imageRect);
        }
        catch (err) {
            console.error('Failed to create image:', err);
            // Add placeholder
            const placeholder = figma.createRectangle();
            placeholder.name = 'placeholder';
            placeholder.resize(width, imageHeight);
            placeholder.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
            frame.appendChild(placeholder);
        }
    }
    // Add label background
    const labelBg = figma.createRectangle();
    labelBg.name = 'label-bg';
    labelBg.x = 0;
    labelBg.y = imageHeight;
    labelBg.resize(width, labelHeight);
    labelBg.fills = [{ type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.98 } }];
    frame.appendChild(labelBg);
    // Add label text
    const label = figma.createText();
    label.name = 'label';
    label.characters = kf.label || '关键帧';
    label.fontSize = 12;
    try {
        label.fontName = { family: 'Inter', style: 'Medium' };
    }
    catch (e) {
        // Use default font
    }
    label.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
    label.x = 10;
    label.y = imageHeight + 9;
    label.resize(width - 20, 14);
    label.textTruncation = 'ENDING';
    frame.appendChild(label);
    // Add timestamp badge if available
    if (kf.timestamp !== undefined) {
        const badge = figma.createFrame();
        badge.name = 'timestamp-badge';
        badge.cornerRadius = 4;
        badge.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.6 }];
        badge.resize(60, 18);
        badge.x = width - 68;
        badge.y = 8;
        const timeText = figma.createText();
        timeText.characters = formatTimestamp(kf.timestamp);
        timeText.fontSize = 10;
        timeText.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
        timeText.x = 6;
        timeText.y = 3;
        badge.appendChild(timeText);
        frame.appendChild(badge);
    }
    return frame;
}
/**
 * Create a smooth curved connection between two nodes with arrow
 */
async function createConnection(parent, fromNode, toNode, label) {
    // Calculate connection points
    const startX = fromNode.x + fromNode.width + 4; // Small gap from node
    const startY = fromNode.y + fromNode.height / 2;
    const endX = toNode.x - 4; // Small gap to node
    const endY = toNode.y + toNode.height / 2;
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    // Check if we're in FigJam (has connector support)
    if (figma.editorType === 'figjam') {
        try {
            const connector = figma.createConnector();
            connector.connectorStart = { endpointNodeId: fromNode.id, magnet: 'RIGHT' };
            connector.connectorEnd = { endpointNodeId: toNode.id, magnet: 'LEFT' };
            connector.connectorEndStrokeCap = 'ARROW_LINES';
            connector.strokeWeight = 1.5;
            connector.strokes = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.65 } }];
            // Connector is automatically added to the page
            return;
        }
        catch (e) {
            // Fall through to vector approach
        }
    }
    // Need a parent for regular Figma vector connections
    if (!parent) {
        return;
    }
    // For regular Figma: Use vectorNetwork with bezier curve
    const lineColor = { r: 0.6, g: 0.6, b: 0.65 };
    // Create vector with precise control over stroke caps
    const vector = figma.createVector();
    vector.name = 'connection';
    // Calculate bezier control point offset (smooth S-curve)
    const dx = endX - startX;
    const controlOffset = Math.max(Math.abs(dx) * 0.4, 30);
    // Use vectorNetwork with bezier tangents for smooth curve
    await vector.setVectorNetworkAsync({
        vertices: [
            { x: startX, y: startY, strokeCap: 'NONE' }, // Start: no arrow
            { x: endX, y: endY, strokeCap: 'ARROW_LINES' } // End: arrow
        ],
        segments: [
            {
                start: 0,
                end: 1,
                // Bezier control points (relative to vertices)
                tangentStart: { x: controlOffset, y: 0 }, // Curve out to the right
                tangentEnd: { x: -controlOffset, y: 0 } // Curve in from the left
            }
        ],
        regions: []
    });
    // Style the line
    vector.strokes = [{ type: 'SOLID', color: lineColor }];
    vector.strokeWeight = 1.5;
    vector.strokeJoin = 'ROUND';
    vector.fills = [];
    parent.appendChild(vector);
    // Add label if provided
    if (label) {
        const labelBg = figma.createRectangle();
        labelBg.name = 'label-bg';
        labelBg.cornerRadius = 4;
        labelBg.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
        labelBg.resize(label.length * 6 + 12, 18);
        labelBg.x = midX - labelBg.width / 2;
        labelBg.y = midY - 9;
        parent.appendChild(labelBg);
        const labelText = figma.createText();
        labelText.characters = label;
        labelText.fontSize = 10;
        labelText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
        labelText.x = midX - label.length * 3;
        labelText.y = midY - 6;
        parent.appendChild(labelText);
    }
}
/**
 * Format timestamp in mm:ss format
 */
function formatTimestamp(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
