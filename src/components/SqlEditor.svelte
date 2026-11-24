<script lang="ts">
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { PostgreSQL } from '@codemirror/lang-sql';
  import { bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language';
  import { EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
  import { classHighlighter } from '@lezer/highlight';
  import { onMount } from 'svelte';

  let { value, change, autofocus = false }: {
    value: string;
    change: (value: string) => void;
    autofocus?: boolean;
  } = $props();
  let container: HTMLDivElement;
  let view = $state.raw<EditorView>();

  onMount(() => {
    const editor = new EditorView({
      parent: container,
      doc: value,
      extensions: [
        PostgreSQL.extension,
        syntaxHighlighting(classHighlighter),
        lineNumbers(),
        highlightActiveLine(),
        bracketMatching(),
        indentOnInput(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.contentAttributes.of({ 'aria-label': 'SQL code', autocapitalize: 'off', spellcheck: 'false' }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) change(update.state.doc.toString());
        }),
      ],
    });
    view = editor;
    if (autofocus) editor.focus();
    return () => editor.destroy();
  });

  $effect(() => {
    if (!view || value === view.state.doc.toString()) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  });
</script>

<div class="query-editor" bind:this={container}></div>
