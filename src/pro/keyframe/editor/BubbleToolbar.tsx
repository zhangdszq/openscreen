/**
 * BubbleToolbar - Floating formatting toolbar (Feishu-style)
 *
 * Appears when text is selected; provides quick formatting toggles.
 */

import React from 'react';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  List,
  ListOrdered,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BubbleToolbarProps {
  editor: Editor;
}

interface ToolBtn {
  icon: React.ElementType;
  label: string;
  isActive: () => boolean;
  action: () => void;
  dividerAfter?: boolean;
}

export function BubbleToolbar({ editor }: BubbleToolbarProps) {
  const tools: ToolBtn[] = [
    {
      icon: Bold,
      label: '加粗 ⌘B',
      isActive: () => editor.isActive('bold'),
      action: () => editor.chain().focus().toggleBold().run(),
    },
    {
      icon: Italic,
      label: '斜体 ⌘I',
      isActive: () => editor.isActive('italic'),
      action: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      icon: Underline,
      label: '下划线 ⌘U',
      isActive: () => editor.isActive('underline'),
      action: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      icon: Strikethrough,
      label: '删除线 ⌘⇧X',
      isActive: () => editor.isActive('strike'),
      action: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      icon: Code,
      label: '行内代码 ⌘E',
      isActive: () => editor.isActive('code'),
      action: () => editor.chain().focus().toggleCode().run(),
      dividerAfter: true,
    },
    {
      icon: Heading1,
      label: '标题 1',
      isActive: () => editor.isActive('heading', { level: 1 }),
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      icon: Heading2,
      label: '标题 2',
      isActive: () => editor.isActive('heading', { level: 2 }),
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      icon: Heading3,
      label: '标题 3',
      isActive: () => editor.isActive('heading', { level: 3 }),
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      dividerAfter: true,
    },
    {
      icon: Quote,
      label: '引用块',
      isActive: () => editor.isActive('blockquote'),
      action: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      icon: List,
      label: '无序列表',
      isActive: () => editor.isActive('bulletList'),
      action: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      icon: ListOrdered,
      label: '有序列表',
      isActive: () => editor.isActive('orderedList'),
      action: () => editor.chain().focus().toggleOrderedList().run(),
    },
  ];

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: ed, from, to }) => {
        // Don't show on empty selections or image nodes
        if (from === to) return false;
        if (ed.isActive('image')) return false;
        return true;
      }}
      className="flex items-center gap-0.5 px-1.5 py-1 bg-[#1a1a1f] border border-white/10 rounded-lg shadow-xl shadow-black/40"
    >
      {tools.map((tool, idx) => (
        <React.Fragment key={idx}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              tool.action();
            }}
            title={tool.label}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              tool.isActive()
                ? 'bg-[#34B27B]/20 text-[#34B27B]'
                : 'text-slate-400 hover:text-white hover:bg-white/10',
            )}
          >
            <tool.icon className="w-4 h-4" />
          </button>
          {tool.dividerAfter && (
            <div className="w-px h-5 bg-white/10 mx-0.5" />
          )}
        </React.Fragment>
      ))}
    </BubbleMenu>
  );
}
