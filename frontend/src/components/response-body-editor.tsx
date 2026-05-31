import { json } from "@codemirror/lang-json";
import { foldGutter } from "@codemirror/language";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  search,
  selectMatches,
  setSearchQuery,
} from "@codemirror/search";
import { EditorView, type Panel, type ViewUpdate, keymap } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useMemo } from "react";

type ResponseBodyEditorProps = {
  ariaLabel?: string;
  value: string;
  wrapLines: boolean;
  readOnly?: boolean;
  onBlur(): void;
  onChange(value: string): void;
  onModEnter?(): void;
};

function createFoldMarker(open: boolean) {
  const marker = document.createElement("span");
  marker.className = open ? "mockkit-fold-marker is-open" : "mockkit-fold-marker is-closed";
  marker.title = open ? "折叠" : "展开";
  marker.setAttribute("aria-hidden", "true");
  return marker;
}

type SearchOption = "caseSensitive" | "regexp" | "wholeWord";
const searchPanels = new WeakMap<EditorView, MockKitSearchPanel>();

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  textContent?: string,
) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (textContent) element.textContent = textContent;
  return element;
}

function createSearchOption(panel: MockKitSearchPanel, option: SearchOption, label: string, title: string) {
  const wrapper = createElement("label", "mockkit-search-option");
  panel.attachTooltip(wrapper, title);

  const input = createElement("input");
  input.type = "checkbox";
  input.setAttribute("aria-label", title);
  input.addEventListener("change", () => panel.commit());

  const labelText = createElement("span", "mockkit-search-option-label", label);
  wrapper.append(input, labelText);
  return { input, option, wrapper };
}

class MockKitSearchPanel implements Panel {
  readonly dom: HTMLElement;
  readonly top = true;
  private readonly abortController = new AbortController();
  private readonly searchInput: HTMLInputElement;
  private tooltipElement: HTMLElement | null = null;
  private readonly options: ReturnType<typeof createSearchOption>[];

  constructor(private readonly view: EditorView) {
    this.dom = createElement("div", "mockkit-search-panel");
    this.searchInput = createElement("input", "mockkit-search-input");
    this.searchInput.type = "search";
    this.searchInput.placeholder = "Find";
    this.searchInput.autocomplete = "off";
    this.searchInput.spellcheck = false;
    this.searchInput.setAttribute("autocapitalize", "none");
    this.searchInput.setAttribute("autocorrect", "off");
    this.searchInput.setAttribute("data-gramm", "false");
    this.searchInput.setAttribute("main-field", "true");
    this.searchInput.addEventListener("input", () => this.commit());
    this.searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        (event.shiftKey ? findPrevious : findNext)(this.view);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeSearchPanel(this.view);
      }
    });
    const stopEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closeSearchPanel(this.view);
    };
    this.searchInput.addEventListener("keydown", stopEscape, { capture: true });
    this.dom.addEventListener("keydown", stopEscape, { capture: true });
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.target instanceof Element && this.dom.contains(event.target)) stopEscape(event);
      },
      { capture: true, signal: this.abortController.signal },
    );

    const previousButton = this.createButton("previous", "上一个", "↑", () => findPrevious(this.view));
    const nextButton = this.createButton("next", "下一个", "↓", () => findNext(this.view));
    const allButton = this.createButton("all", "选中全部", "≡", () => selectMatches(this.view));
    const closeButton = this.createButton("close", "关闭", "×", () => closeSearchPanel(this.view));

    this.options = [
      createSearchOption(this, "caseSensitive", "Aa", "区分大小写"),
      createSearchOption(this, "wholeWord", "Word", "整词匹配"),
      createSearchOption(this, "regexp", ".*", "正则表达式"),
    ];

    const searchField = createElement("div", "mockkit-search-field");
    searchField.append(this.searchInput, ...this.options.map((item) => item.wrapper));
    this.dom.append(searchField, previousButton, nextButton, allButton, closeButton);
    this.syncFromQuery(getSearchQuery(view.state));
    searchPanels.set(view, this);
  }

  mount() {
    this.searchInput.focus();
    this.searchInput.select();
  }

  update(update: ViewUpdate) {
    for (const transaction of update.transactions) {
      for (const effect of transaction.effects) {
        if (effect.is(setSearchQuery)) {
          this.syncFromQuery(effect.value);
        }
      }
    }
  }

  destroy() {
    this.abortController.abort();
    this.hideTooltip();
    searchPanels.delete(this.view);
  }

  focus() {
    this.searchInput.focus();
    this.searchInput.select();
  }

  commit() {
    const current = getSearchQuery(this.view.state);
    const query = new SearchQuery({
      search: this.searchInput.value,
      caseSensitive: this.optionChecked("caseSensitive"),
      regexp: this.optionChecked("regexp"),
      wholeWord: this.optionChecked("wholeWord"),
      replace: current.replace,
    });
    if (!query.eq(current)) this.view.dispatch({ effects: setSearchQuery.of(query) });
  }

  attachTooltip(target: HTMLElement, label: string) {
    target.addEventListener("mouseenter", () => this.showTooltip(target, label), {
      signal: this.abortController.signal,
    });
    target.addEventListener("mouseleave", () => this.hideTooltip(), { signal: this.abortController.signal });
    target.addEventListener("focusin", () => this.showTooltip(target, label), {
      signal: this.abortController.signal,
    });
    target.addEventListener("focusout", () => this.hideTooltip(), { signal: this.abortController.signal });
  }

  private showTooltip(target: HTMLElement, label: string) {
    this.hideTooltip();
    const tooltip = createElement("div", "mockkit-search-floating-tooltip", label);
    tooltip.setAttribute("role", "tooltip");
    document.body.append(tooltip);
    this.tooltipElement = tooltip;
    window.requestAnimationFrame(() => this.positionTooltip(target, tooltip));
  }

  private positionTooltip(target: HTMLElement, tooltip: HTMLElement) {
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const gap = 8;
    const viewportPadding = 8;
    const targetCenter = targetRect.left + targetRect.width / 2;
    const preferredLeft = targetCenter - tooltipRect.width / 2;
    const left = Math.min(
      Math.max(viewportPadding, preferredLeft),
      window.innerWidth - tooltipRect.width - viewportPadding,
    );
    const top = targetRect.bottom + gap;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.setProperty("--tooltip-arrow-left", `${targetCenter - left}px`);
    tooltip.dataset.ready = "true";
  }

  private hideTooltip() {
    this.tooltipElement?.remove();
    this.tooltipElement = null;
  }

  private createButton(name: string, label: string, text: string, onClick: () => void) {
    const button = createElement("button", "mockkit-search-button", text);
    button.type = "button";
    button.name = name;
    button.setAttribute("aria-label", label);
    this.attachTooltip(button, label);
    button.addEventListener("click", onClick);
    return button;
  }

  private optionChecked(option: SearchOption) {
    return this.options.find((item) => item.option === option)?.input.checked ?? false;
  }

  private syncFromQuery(query: SearchQuery) {
    if (this.searchInput.value !== query.search) this.searchInput.value = query.search;
    for (const item of this.options) {
      const checked = query[item.option];
      item.input.checked = checked;
      item.wrapper.dataset.checked = String(checked);
    }
  }

}

function createSearchPanel(view: EditorView) {
  return new MockKitSearchPanel(view);
}

function openMockKitSearchPanel(view: EditorView) {
  const handled = openSearchPanel(view);
  window.requestAnimationFrame(() => searchPanels.get(view)?.focus());
  return handled;
}

export default function ResponseBodyEditor({
  ariaLabel = "响应内容",
  value,
  wrapLines,
  readOnly = false,
  onBlur,
  onChange,
  onModEnter,
}: ResponseBodyEditorProps) {
  const extensions = useMemo(
    () => [
      json(),
      foldGutter({
        markerDOM: createFoldMarker,
      }),
      search({ top: true, createPanel: createSearchPanel }),
      keymap.of([
        {
          key: "Mod-f",
          run: openMockKitSearchPanel,
        },
      ]),
      ...(wrapLines ? [EditorView.lineWrapping] : []),
      ...(onModEnter
        ? [
            keymap.of([
              {
                key: "Mod-Enter",
                run: () => {
                  onModEnter();
                  return true;
                },
              },
            ]),
          ]
        : []),
    ],
    [onModEnter, wrapLines],
  );
  const handleUpdate = useCallback(
    (update: ViewUpdate) => {
      if (readOnly) return;
      if (!update.docChanged) return;
      onChange(update.state.doc.toString());
    },
    [onChange, readOnly],
  );

  return (
    <CodeMirror
      aria-label={ariaLabel}
      value={value}
      height="100%"
      basicSetup={{
        autocompletion: true,
        bracketMatching: true,
        closeBrackets: true,
        foldGutter: false,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        lineNumbers: true,
      }}
      extensions={extensions}
      editable={!readOnly}
      readOnly={readOnly}
      theme="light"
      onUpdate={handleUpdate}
      onBlur={onBlur}
    />
  );
}
