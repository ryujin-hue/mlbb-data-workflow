/**
 * Minimal DOM helpers.
 *
 * Every text value reaches the document through `textContent` — never
 * `innerHTML`. Skill descriptions and hero titles come from a third-party
 * wiki dump, so treating them as markup would be an injection vector.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {string} tag
 * @param {Object<string,*>} props  `class`, `text`, `html` (never), attrs, listeners
 * @param {...(Node|string|null|undefined|Array)} children
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') {
      node.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
    } else if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else if (key === 'style') {
      Object.assign(node.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node && key !== 'list' && typeof value !== 'object') {
      node[key] = value;
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }

  append(node, children);
  return node;
}

/**
 * Append children. Accepts both `append(p, [a, b])` and `append(p, a, b)`.
 */
export function append(parent, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function frag(...children) {
  return append(document.createDocumentFragment(), children);
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Replace the contents of `node` with `children`. */
export function render(node, ...children) {
  clear(node);
  append(node, children);
  return node;
}

/**
 * Image with a text fallback when the asset is missing or fails to load.
 * Used for hero portraits, skill icons and item icons.
 */
export function img(src, alt, { cls = '', width = 34, height = 44, emptyText = '—', fit } = {}) {
  const fallbackClass = ['thumb-empty', cls].filter(Boolean).join(' ');

  if (!src) {
    return el('div', {
      class: fallbackClass,
      text: emptyText,
      title: 'No image in dataset',
      'aria-hidden': 'true',
    });
  }

  const node = el('img', {
    src,
    alt,
    class: cls || null,
    loading: 'lazy',
    decoding: 'async',
    width,
    height,
    style: fit ? { objectFit: fit } : null,
  });

  node.addEventListener('error', () => {
    node.replaceWith(el('div', {
      class: fallbackClass,
      text: emptyText,
      title: 'Image failed to load',
    }));
  }, { once: true });

  return node;
}

export { SVG_NS };
