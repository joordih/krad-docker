function node(type, key, fields) {
    return { key, type, ...fields };
}
export const ui = {
    flex: (key, children, options = {}) => node("flex", key, { ...options, children }),
    row: (key, children, style = {}) => node("flex", key, { direction: "row", style, children }),
    column: (key, children, style = {}) => node("flex", key, { direction: "column", align: "stretch", style, children }),
    stack: (key, children, style = {}) => node("stack", key, { style, children }),
    grid: (key, columns, children, style = {}) => node("grid", key, { columns, style, children }),
    scroll: (key, children, direction = "column") => node("scroll", key, { direction, children }),
    text: (key, text, style = {}) => node("text", key, { text, style }),
    markdown: (key, text) => node("markdown", key, { text }),
    icon: (key, icon, color) => node("icon", key, { icon, color: color ?? null }),
    image: (key, source, width = "auto", height = "auto") => node("image", key, { source, width, height }),
    badge: (key, text, tone = "neutral") => node("badge", key, { text, tone }),
    spinner: (key) => node("spinner", key, {}),
    divider: (key) => node("divider", key, {}),
    button: (key, action, options = {}) => node("button", key, { action, ...options }),
    input: (key, action, options = {}) => node("input", key, { action, ...options }),
    toggle: (key, action, value, label) => node("toggle", key, { action, value, label: label ?? null }),
    select: (key, action, options, value) => node("select", key, { action, options, value: value ?? null }),
    list: (key, count, selection = "none") => node("list", key, { count, selection }),
    tree: (key, items) => node("tree", key, { items }),
    table: (key, columns, count, sort) => node("table", key, { columns, count, sort: sort ?? null }),
    form: (key, submit, fields, submitLabel) => node("form", key, { submit, fields, submit_label: submitLabel ?? null }),
    details: (key, entries) => node("details", key, { entries }),
    stream: (key, lines = [], maxLines) => node("stream", key, maxLines === undefined ? { lines } : { lines, max_lines: maxLines }),
    terminal: (key, terminal) => node("terminal", key, { terminal }),
};
export const patch = {
    replace: (node) => ({ op: "replace", node }),
    insert: (parent, index, node) => ({ op: "insert", parent, index, node }),
    remove: (key) => ({ op: "remove", key }),
    setCount: (key, count) => ({ op: "set_count", key, count }),
    invalidate: (key) => ({ op: "invalidate", key }),
    replaceItem: (tree, item) => ({ op: "replace_item", tree, item }),
    append: (key, lines) => ({ op: "append", key, lines }),
};
