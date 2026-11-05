export type Icon = "add" | "attach" | "bell" | "book" | "cancel" | "check" | "chevron-down" | "chevron-left" | "chevron-right" | "chevron-up" | "close" | "copy" | "exchange" | "expand" | "file" | "flag" | "flash" | "flow" | "folder" | "git-branch" | "key" | "layers" | "list-view" | "loading" | "lock" | "magic" | "minus" | "more" | "note" | "open-external" | "pencil" | "play" | "plug" | "refresh" | "repeat" | "search" | "settings" | "stop" | "target" | "tasks" | "terminal" | "tree-view" | "undo" | "workflow";
export type ColorToken = "text_strong" | "text_default" | "text_subtle" | "text_muted" | "text_disabled" | "accent" | "on_accent" | "success" | "warning" | "error" | "info" | "surface" | "panel" | "hover" | "selected" | "border" | "divider" | "chip" | "chip_text";
export type Tone = "neutral" | "info" | "success" | "warning" | "error";
export type Space = "none" | "xs" | "sm" | "md" | "lg" | "xl";
export type Radius = "none" | "sm" | "md" | "lg" | "full";
export type TextSize = "xs" | "sm" | "md" | "lg";
export type Weight = "regular" | "medium" | "bold";
export type Font = "interface" | "mono";
export type Direction = "row" | "column";
export type Align = "start" | "center" | "end" | "stretch";
export type Justify = "start" | "center" | "end" | "between";
export type Wrap = "no_wrap" | "wrap";
export type Size = "auto" | "fill" | {
    fixed: number;
};
export interface Style {
    padding?: Space;
    gap?: Space;
    background?: ColorToken | null;
    border?: ColorToken | null;
    radius?: Radius;
    width?: Size;
    height?: Size;
}
export interface TextStyle {
    size?: TextSize;
    weight?: Weight;
    font?: Font;
    color?: ColorToken | null;
    wrap?: Wrap;
}
export type ImageSource = {
    bundled: string;
} | {
    png: string;
};
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type Enabled = "yes" | "no";
export type InputKind = "text" | "multiline" | "secret";
export type Selection = "none" | "single" | "many";
export type Expansion = "leaf" | "collapsed" | "expanded";
export type Sortable = "no" | "yes";
export type SortOrder = "ascending" | "descending";
export interface Choice {
    value: string;
    label: string;
}
export interface ItemAction {
    action: string;
    label: string;
    icon?: Icon | null;
    tone?: Tone;
}
export interface Badge {
    text: string;
    tone?: Tone;
}
export interface TreeItem {
    key: string;
    label: string;
    description?: string | null;
    icon?: Icon | null;
    badge?: Badge | null;
    expansion?: Expansion;
    children?: TreeItem[];
    actions?: ItemAction[];
    menu?: ItemAction[];
}
export interface Column {
    key: string;
    title: string;
    width?: Size;
    sortable?: Sortable;
}
export interface Sort {
    column: string;
    order: SortOrder;
}
export type FieldKind = {
    type: "text";
    value?: string;
    placeholder?: string | null;
    kind?: InputKind;
} | {
    type: "toggle";
    value?: boolean;
} | {
    type: "number";
    value?: number;
} | {
    type: "select";
    options: Choice[];
    value?: string | null;
};
export type Field = {
    key: string;
    label: string;
} & FieldKind;
export interface Detail {
    label: string;
    value: string;
    style?: TextStyle;
}
export interface StreamLine {
    text: string;
    tone?: Tone;
}
export type Element = {
    type: "flex";
    direction?: Direction;
    align?: Align;
    justify?: Justify;
    wrap?: Wrap;
    style?: Style;
    children?: Node[];
} | {
    type: "stack";
    style?: Style;
    children?: Node[];
} | {
    type: "grid";
    columns: number;
    style?: Style;
    children?: Node[];
} | {
    type: "scroll";
    direction?: Direction;
    style?: Style;
    children?: Node[];
} | {
    type: "text";
    text: string;
    style?: TextStyle;
} | {
    type: "markdown";
    text: string;
} | {
    type: "icon";
    icon: Icon;
    color?: ColorToken | null;
} | {
    type: "image";
    source: ImageSource;
    width?: Size;
    height?: Size;
} | {
    type: "badge";
    text: string;
    tone?: Tone;
} | {
    type: "spinner";
} | {
    type: "divider";
} | {
    type: "button";
    action: string;
    label?: string | null;
    icon?: Icon | null;
    variant?: ButtonVariant;
    enabled?: Enabled;
    tooltip?: string | null;
} | {
    type: "input";
    action: string;
    value?: string;
    placeholder?: string | null;
    kind?: InputKind;
} | {
    type: "toggle";
    action: string;
    value: boolean;
    label?: string | null;
} | {
    type: "select";
    action: string;
    options: Choice[];
    value?: string | null;
} | {
    type: "list";
    count: number;
    selection?: Selection;
} | {
    type: "tree";
    items: TreeItem[];
} | {
    type: "table";
    columns: Column[];
    count: number;
    sort?: Sort | null;
} | {
    type: "form";
    submit: string;
    fields: Field[];
    submit_label?: string | null;
} | {
    type: "details";
    entries: Detail[];
} | {
    type: "stream";
    lines?: StreamLine[];
    max_lines?: number;
} | {
    type: "terminal";
    terminal: number;
};
export type Node = {
    key: string;
} & Element;
export interface ListRow {
    node: Node;
    menu?: ItemAction[];
}
export interface TableRow {
    key: string;
    cells: Node[];
    menu?: ItemAction[];
}
export type Patch = {
    op: "replace";
    node: Node;
} | {
    op: "insert";
    parent: string;
    index: number;
    node: Node;
} | {
    op: "remove";
    key: string;
} | {
    op: "set_count";
    key: string;
    count: number;
} | {
    op: "invalidate";
    key: string;
} | {
    op: "replace_item";
    tree: string;
    item: TreeItem;
} | {
    op: "append";
    key: string;
    lines: StreamLine[];
};
export type FieldValue = boolean | number | string;
export type ViewEvent = {
    kind: "click";
    action: string;
} | {
    kind: "input";
    action: string;
    text: string;
} | {
    kind: "submit";
    action: string;
    text: string;
} | {
    kind: "toggle";
    action: string;
    value: boolean;
} | {
    kind: "select";
    action: string;
    value: string;
} | {
    kind: "form";
    action: string;
    values: Record<string, FieldValue>;
} | {
    kind: "expand";
    item: string;
} | {
    kind: "collapse";
    item: string;
} | {
    kind: "choose";
    node: string;
    items: string[];
} | {
    kind: "item_action";
    action: string;
    item: string;
} | {
    kind: "sort";
    node: string;
    sort: Sort;
};
type Without<T, K extends keyof T> = Omit<T, K>;
type ElementOf<T extends Element["type"]> = Extract<Element, {
    type: T;
}>;
export declare const ui: {
    flex: (key: string, children: Node[], options?: Without<ElementOf<"flex">, "type" | "children">) => Node;
    row: (key: string, children: Node[], style?: Style) => Node;
    column: (key: string, children: Node[], style?: Style) => Node;
    stack: (key: string, children: Node[], style?: Style) => Node;
    grid: (key: string, columns: number, children: Node[], style?: Style) => Node;
    scroll: (key: string, children: Node[], direction?: Direction) => Node;
    text: (key: string, text: string, style?: TextStyle) => Node;
    markdown: (key: string, text: string) => Node;
    icon: (key: string, icon: Icon, color?: ColorToken) => Node;
    image: (key: string, source: ImageSource, width?: Size, height?: Size) => Node;
    badge: (key: string, text: string, tone?: Tone) => Node;
    spinner: (key: string) => Node;
    divider: (key: string) => Node;
    button: (key: string, action: string, options?: Without<ElementOf<"button">, "type" | "action">) => Node;
    input: (key: string, action: string, options?: Without<ElementOf<"input">, "type" | "action">) => Node;
    toggle: (key: string, action: string, value: boolean, label?: string) => Node;
    select: (key: string, action: string, options: Choice[], value?: string) => Node;
    list: (key: string, count: number, selection?: Selection) => Node;
    tree: (key: string, items: TreeItem[]) => Node;
    table: (key: string, columns: Column[], count: number, sort?: Sort) => Node;
    form: (key: string, submit: string, fields: Field[], submitLabel?: string) => Node;
    details: (key: string, entries: Detail[]) => Node;
    stream: (key: string, lines?: StreamLine[], maxLines?: number) => Node;
    terminal: (key: string, terminal: number) => Node;
};
export declare const patch: {
    replace: (node: Node) => Patch;
    insert: (parent: string, index: number, node: Node) => Patch;
    remove: (key: string) => Patch;
    setCount: (key: string, count: number) => Patch;
    invalidate: (key: string) => Patch;
    replaceItem: (tree: string, item: TreeItem) => Patch;
    append: (key: string, lines: StreamLine[]) => Patch;
};
export {};
