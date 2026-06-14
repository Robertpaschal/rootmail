"use client";

import { useEffect } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { Color } from "@tiptap/extension-color";
import { Image } from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  MousePointerClick,
  Quote,
} from "lucide-react";
import { BRAND, type DocNode } from "@/lib/email-doc";
import { cn } from "@/lib/utils";

// A CTA button as a first-class, atomic node so it round-trips through the doc.
const EmailButton = Node.create({
  name: "button",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { label: { default: "Get started" }, href: { default: "" }, bg: { default: BRAND } };
  },
  parseHTML() {
    return [{ tag: "a[data-rm-button]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-rm-button": "",
        href: node.attrs.href,
        style: `display:inline-block;padding:10px 20px;border-radius:6px;background:${node.attrs.bg};color:#fff;font-weight:600;text-decoration:none;cursor:pointer;`,
      }),
      node.attrs.label,
    ];
  },
});

export function WritingEditor({
  initialDoc,
  onChange,
}: {
  initialDoc: DocNode;
  onChange: (doc: DocNode) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, HTMLAttributes: { rel: "noopener" } },
      }),
      TextStyle,
      Color,
      Image,
      Placeholder.configure({ placeholder: "Write your email… use the toolbar to format." }),
      EmailButton,
    ],
    content: initialDoc,
    editorProps: {
      attributes: {
        class:
          "prose-email min-h-[360px] rounded-md border bg-white px-4 py-3 text-sm leading-relaxed focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as DocNode),
  });

  // Keep the editor in sync if the template loads after mount.
  useEffect(() => {
    if (editor && initialDoc && editor.isEmpty) {
      editor.commands.setContent(initialDoc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) {
    return <div className="min-h-[360px] rounded-md border bg-muted/30" />;
  }

  return (
    <div className="space-y-2">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const promptLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const insertImage = () => {
    const src = window.prompt("Image URL");
    if (src) editor.chain().focus().setImage({ src }).run();
  };

  const insertButton = () => {
    const label = window.prompt("Button label", "Get started");
    if (label === null) return;
    const href = window.prompt("Button link", "{{action_url}}") ?? "";
    editor.chain().focus().insertContent({ type: "button", attrs: { label, href, bg: BRAND } }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-md border bg-card p-1">
      <Btn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} label="Heading 1">
        <Heading1 className="size-4" />
      </Btn>
      <Btn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="Heading 2">
        <Heading2 className="size-4" />
      </Btn>
      <Btn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} label="Heading 3">
        <Heading3 className="size-4" />
      </Btn>
      <Divider />
      <Btn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} label="Bold">
        <Bold className="size-4" />
      </Btn>
      <Btn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} label="Italic">
        <Italic className="size-4" />
      </Btn>
      <Btn active={editor.isActive("link")} onClick={promptLink} label="Link">
        <Link2 className="size-4" />
      </Btn>
      <label className="ml-0.5 flex size-8 cursor-pointer items-center justify-center" title="Text color">
        <span
          className="size-4 rounded-full border"
          style={{ background: (editor.getAttributes("textStyle").color as string) || "#111827" }}
        />
        <input
          type="color"
          className="sr-only"
          value={(editor.getAttributes("textStyle").color as string) || "#111827"}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        />
      </label>
      <Divider />
      <Btn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} label="Bullet list">
        <List className="size-4" />
      </Btn>
      <Btn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="Numbered list">
        <ListOrdered className="size-4" />
      </Btn>
      <Btn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} label="Quote">
        <Quote className="size-4" />
      </Btn>
      <Divider />
      <Btn onClick={insertButton} label="Button">
        <MousePointerClick className="size-4" />
      </Btn>
      <Btn onClick={insertImage} label="Image">
        <ImageIcon className="size-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} label="Divider">
        <Minus className="size-4" />
      </Btn>
    </div>
  );
}

function Btn({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        active && "bg-secondary text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" />;
}
