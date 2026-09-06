import { useEffect, useMemo, useState } from 'react';

import { Alert, Button, Empty, Skeleton, Space, Typography } from 'antd';
import hljs from 'highlight.js';
import ReactMarkdown from 'react-markdown';

import { MONO_FONT } from '@app/theme';
import type { SkillFileContent } from '@domain/entities';

import { resolveHighlightLanguage } from './highlight-language-map';

import 'highlight.js/styles/github.css';

export interface SkillFileContentPanelProps {
  content: SkillFileContent | undefined;
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  onRetry: () => void;
}

function extensionOf(relativePath: string): string {
  const name = relativePath.split('/').pop() ?? relativePath;
  const dotIndex = name.lastIndexOf('.');
  return dotIndex <= 0 ? '' : name.slice(dotIndex).toLowerCase();
}

/**
 * Every `.md` file in this project's own convention opens with a `---`-delimited
 * YAML frontmatter block (see `templates.md`). `react-markdown` has no frontmatter
 * plugin loaded, so left in place that block reads as ordinary paragraph text and
 * collapses onto one unreadable line ahead of the real content. Preview mode strips
 * it; Plain text mode still shows the byte-exact original, frontmatter included.
 */
function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

function RawText({ text }: { text: string }) {
  return (
    <Typography.Paragraph>
      <pre style={{ fontFamily: MONO_FONT, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {text}
      </pre>
    </Typography.Paragraph>
  );
}

function HighlightedText({ text, extension }: { text: string; extension: string }) {
  const highlighted = useMemo(() => {
    const language = resolveHighlightLanguage(extension);
    try {
      return language
        ? hljs.highlight(text, { language, ignoreIllegals: true }).value
        : hljs.highlightAuto(text).value;
    } catch {
      return undefined;
    }
  }, [text, extension]);

  if (highlighted === undefined) {
    return <RawText text={text} />;
  }

  return (
    <pre style={{ fontFamily: MONO_FONT, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      <code
        className="hljs"
        // eslint-disable-next-line react/no-danger -- output comes from highlight.js, not user-supplied HTML
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </pre>
  );
}

/**
 * Renders a file's content — markdown files preview as formatted markdown by
 * default (with a "Plain text" toggle back to raw source), other text files
 * get syntax highlighting via `highlight.js` when their extension maps to a
 * known language, and binary/truncated handling from T-01-06 is unchanged.
 */
export function SkillFileContentPanel({ content, isLoading, isError, error, onRetry }: SkillFileContentPanelProps) {
  const [showPlainText, setShowPlainText] = useState(false);

  useEffect(() => {
    setShowPlainText(false);
  }, [content?.relativePath]);

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        title="Couldn't load this file"
        description={error}
        action={
          <Button size="small" onClick={onRetry}>
            Retry
          </Button>
        }
      />
    );
  }

  if (isLoading || !content) {
    return <Skeleton active paragraph={{ rows: 10 }} />;
  }

  if (content.encoding === 'binary') {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Preview not available for this file type" />;
  }

  const extension = extensionOf(content.relativePath);
  const isMarkdown = extension === '.md';
  const text = content.content ?? '';

  return (
    <div>
      {content.truncated ? (
        <Alert
          type="warning"
          showIcon
          title="Truncated — too large to preview in full"
          style={{ marginBottom: 12 }}
        />
      ) : null}
      {isMarkdown ? (
        <Space style={{ marginBottom: 12 }}>
          <Button size="small" onClick={() => setShowPlainText((current) => !current)}>
            {showPlainText ? 'Preview' : 'Plain text'}
          </Button>
        </Space>
      ) : null}
      {isMarkdown ? (
        showPlainText ? (
          <RawText text={text} />
        ) : (
          <Typography.Paragraph>
            <ReactMarkdown>{stripFrontmatter(text)}</ReactMarkdown>
          </Typography.Paragraph>
        )
      ) : (
        <HighlightedText text={text} extension={extension} />
      )}
    </div>
  );
}
