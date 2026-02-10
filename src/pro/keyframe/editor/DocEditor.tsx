/**
 * DocEditor - Markdown-native Tiptap editor (Feishu-style)
 *
 * Content is stored and edited as Markdown. Features:
 *  - Markdown input rules (# heading, **bold**, > quote, - list, etc.)
 *  - Inline image rendering (base64 data URLs)
 *  - Floating bubble toolbar on text selection
 *  - Slash "/" command menu for block insertion
 *  - Rich text formatting with keyboard shortcuts
 */

import { useEffect, useImperativeHandle, forwardRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import ImageExt from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Markdown } from 'tiptap-markdown';
import { common, createLowlight } from 'lowlight';

import { BubbleToolbar } from './BubbleToolbar';
import { SlashCommand } from './SlashCommandMenu';

import './editorStyles.css';
import './slashCommandTheme.css';

const lowlight = createLowlight(common);

// ── Public API exposed via ref ──

export interface DocEditorRef {
  /** Get content as Markdown */
  getMarkdown: () => string;
  /** Get content as HTML (for rich-text copy) */
  getHTML: () => string;
  /** Get plain text content */
  getText: () => string;
  /** Get the underlying Tiptap editor instance */
  getEditor: () => ReturnType<typeof useEditor> | null;
}

interface DocEditorProps {
  /** Initial content in Markdown format */
  initialContent?: string;
  /** Placeholder text for an empty editor */
  placeholder?: string;
  /** Called when content changes (Markdown string) */
  onUpdate?: (markdown: string) => void;
  /** Extra CSS class for the wrapper */
  className?: string;
}

export const DocEditor = forwardRef<DocEditorRef, DocEditorProps>(
  ({ initialContent, placeholder, onUpdate, className }, ref) => {
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          // Disable the built-in codeBlock so we can use lowlight version
          codeBlock: false,
          heading: { levels: [1, 2, 3] },
        }),
        UnderlineExt,
        Placeholder.configure({
          placeholder: ({ node }) => {
            if (node.type.name === 'heading') {
              const level = node.attrs.level;
              return `标题 ${level}`;
            }
            return placeholder || '输入 "/" 插入内容，支持 Markdown 语法…';
          },
          showOnlyWhenEditable: true,
          showOnlyCurrent: true,
        }),
        ImageExt.configure({
          HTMLAttributes: {
            draggable: 'false',
          },
          inline: false,
          allowBase64: true,
        }),
        CodeBlockLowlight.configure({
          lowlight,
          defaultLanguage: null,
        }),
        // Enable Markdown parsing / serialization
        Markdown.configure({
          html: true,
          tightLists: true,
          transformPastedText: true,
          transformCopiedText: true,
          breaks: false,
        }),
        SlashCommand,
      ],
      // Content is provided as Markdown - the Markdown extension parses it
      content: initialContent || '',
      editorProps: {
        attributes: {
          class: 'focus:outline-none',
          spellcheck: 'false',
        },
      },
      onUpdate: ({ editor: ed }) => {
        const mdStorage = (ed.storage as Record<string, any>).markdown;
        const md = mdStorage?.getMarkdown?.() ?? ed.getText();
        onUpdate?.(md);
      },
    });

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      getMarkdown: () => {
        const mdStorage = (editor?.storage as Record<string, any> | undefined)?.markdown;
        return mdStorage?.getMarkdown?.() ?? '';
      },
      getHTML: () => editor?.getHTML() ?? '',
      getText: () => editor?.getText() ?? '',
      getEditor: () => editor,
    }));

    // Set content on first mount
    useEffect(() => {
      if (editor && initialContent && !editor.isDestroyed) {
        const currentContent = editor.getHTML();
        if (currentContent === '<p></p>' || currentContent === '') {
          editor.commands.setContent(initialContent);
        }
      }
    }, [editor, initialContent]);

    if (!editor) return null;

    return (
      <div className={`tiptap-doc-editor ${className ?? ''}`}>
        <BubbleToolbar editor={editor} />
        <EditorContent editor={editor} />
      </div>
    );
  },
);

DocEditor.displayName = 'DocEditor';
