/**
 * SlashCommandMenu - Feishu-style "/" command palette
 *
 * Typing "/" in an empty paragraph opens a floating menu with
 * block-type insertion options (headings, lists, quotes, code, divider, etc).
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Extension, type Editor, type Range } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code2,
  Minus,
  TextIcon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Command item definition ──

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: LucideIcon;
  command: (props: { editor: Editor; range: Range }) => void;
  keywords?: string[];
  group: string;
}

/**
 * Default slash command items
 */
export function getDefaultSlashCommands(): SlashCommandItem[] {
  return [
    {
      title: '正文',
      description: '普通段落文本',
      icon: TextIcon,
      group: '基础',
      keywords: ['paragraph', 'text', '正文', '段落'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setParagraph().run();
      },
    },
    {
      title: '标题 1',
      description: '大标题',
      icon: Heading1,
      group: '基础',
      keywords: ['h1', 'heading', '标题', '大标题'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
      },
    },
    {
      title: '标题 2',
      description: '中标题',
      icon: Heading2,
      group: '基础',
      keywords: ['h2', 'heading', '标题', '中标题'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
      },
    },
    {
      title: '标题 3',
      description: '小标题',
      icon: Heading3,
      group: '基础',
      keywords: ['h3', 'heading', '标题', '小标题'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
      },
    },
    {
      title: '无序列表',
      description: '项目符号列表',
      icon: List,
      group: '列表',
      keywords: ['bullet', 'list', 'ul', '列表', '无序'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run();
      },
    },
    {
      title: '有序列表',
      description: '编号列表',
      icon: ListOrdered,
      group: '列表',
      keywords: ['ordered', 'list', 'ol', 'number', '编号', '有序'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run();
      },
    },
    {
      title: '引用',
      description: '引用块',
      icon: Quote,
      group: '块',
      keywords: ['quote', 'blockquote', '引用'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBlockquote().run();
      },
    },
    {
      title: '代码块',
      description: '格式化代码片段',
      icon: Code2,
      group: '块',
      keywords: ['code', 'codeblock', '代码', '代码块'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
      },
    },
    {
      title: '分割线',
      description: '水平分隔线',
      icon: Minus,
      group: '块',
      keywords: ['hr', 'divider', 'horizontal', 'rule', '分割线', '分隔线'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHorizontalRule().run();
      },
    },
  ];
}

// ── Dropdown component ──

interface CommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export interface CommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const CommandList = forwardRef<CommandListRef, CommandListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Reset index when items change
    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    // Scroll selected item into view
    useLayoutEffect(() => {
      const container = scrollRef.current;
      if (!container) return;
      const el = container.children[selectedIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) command(item);
      },
      [items, command],
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="px-3 py-4 text-sm text-slate-500 text-center">
          没有匹配的命令
        </div>
      );
    }

    // Group items
    const groups: Record<string, SlashCommandItem[]> = {};
    items.forEach((item) => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    });

    let globalIndex = -1;

    return (
      <div
        ref={scrollRef}
        className="max-h-[320px] overflow-y-auto py-1"
      >
        {Object.entries(groups).map(([group, groupItems]) => (
          <div key={group}>
            <div className="px-3 py-1.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              {group}
            </div>
            {groupItems.map((item) => {
              globalIndex++;
              const idx = globalIndex;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => selectItem(idx)}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2 text-left transition-colors',
                    idx === selectedIndex
                      ? 'bg-[#34B27B]/15 text-white'
                      : 'text-slate-300 hover:bg-white/5',
                  )}
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-white/5 border border-white/5 flex-shrink-0">
                    <item.icon className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{item.title}</div>
                    <div className="text-xs text-slate-500 truncate">{item.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  },
);

CommandList.displayName = 'CommandList';

// ── Suggestion plugin config ──

function createSuggestionConfig(): Omit<SuggestionOptions<SlashCommandItem>, 'editor'> {
  return {
    char: '/',
    items: ({ query }) => {
      const all = getDefaultSlashCommands();
      if (!query) return all;
      const q = query.toLowerCase();
      return all.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.keywords?.some((kw) => kw.toLowerCase().includes(q)),
      );
    },
    render: () => {
      let component: ReactRenderer<CommandListRef> | null = null;
      let popup: TippyInstance[] | null = null;

      return {
        onStart: (props) => {
          component = new ReactRenderer(CommandList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) return;

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
            arrow: false,
            offset: [0, 6],
            popperOptions: {
              modifiers: [{ name: 'flip', options: { fallbackPlacements: ['top-start'] } }],
            },
            // Styling via CSS class
            theme: 'slash-command',
          });
        },
        onUpdate: (props) => {
          component?.updateProps(props);
          if (!props.clientRect || !popup?.[0]) return;
          popup[0].setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          });
        },
        onKeyDown: (props) => {
          if (props.event.key === 'Escape') {
            popup?.[0]?.hide();
            return true;
          }
          return component?.ref?.onKeyDown(props) ?? false;
        },
        onExit: () => {
          popup?.[0]?.destroy();
          component?.destroy();
        },
      };
    },
  };
}

// ── Tiptap Extension ──

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addOptions() {
    return {
      suggestion: createSuggestionConfig(),
    };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
