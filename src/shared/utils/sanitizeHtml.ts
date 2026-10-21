import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "blockquote",
    "code",
    "pre",
    "span",
    "font",
];

const ALLOWED_ATTR = ["class", "color", "style"];

/**
 * style 속성에서 허용하는 CSS 속성.
 * 현재 Tiptap 에디터(StarterKit)는 style 을 만들지 않지만, 과거 데이터·붙여넣기 HTML 의
 * 글자색·정렬·강조 정도만 살린다. position/fixed, z-index, 크기·여백, url() 배경 등
 * 화면을 덮거나 피싱 UI 를 만들 수 있는 속성은 모두 버린다.
 */
const ALLOWED_STYLE_PROPS = new Set([
    "color",
    "background-color",
    "text-align",
    "font-weight",
    "font-style",
    "text-decoration",
    "text-decoration-line",
]);

/** 값에 url()·expression() 등 외부 리소스/스크립트 경로가 있으면 버린다 */
const UNSAFE_STYLE_VALUE = /url\s*\(|expression\s*\(|javascript:|@import|[<>]/i;

function filterStyle(style: string): string {
    return style
        .split(";")
        .map((decl) => {
            const idx = decl.indexOf(":");
            if (idx === -1) return null;
            const prop = decl.slice(0, idx).trim().toLowerCase();
            const value = decl.slice(idx + 1).trim();
            if (!prop || !value) return null;
            if (!ALLOWED_STYLE_PROPS.has(prop)) return null;
            if (UNSAFE_STYLE_VALUE.test(value)) return null;
            return `${prop}: ${value}`;
        })
        .filter((decl): decl is string => decl !== null)
        .join("; ");
}

/** style 속성을 허용 목록 기준으로 걸러내는 훅 — sanitize 호출 동안만 등록한다 */
function styleAllowlistHook(
    _node: Element,
    data: { attrName: string; attrValue: string; keepAttr: boolean },
) {
    if (data.attrName !== "style") return;
    const filtered = filterStyle(data.attrValue);
    if (filtered) {
        data.attrValue = filtered;
    } else {
        data.keepAttr = false;
    }
}

export function sanitizeHtml(html: string | null | undefined) {
    if (!html) return "";
    // 전역 DOMPurify 인스턴스에 훅이 남지 않도록 호출 범위에서만 등록·해제한다 (동기 실행)
    DOMPurify.addHook("uponSanitizeAttribute", styleAllowlistHook);
    try {
        return DOMPurify.sanitize(html, {
            ALLOWED_TAGS,
            ALLOWED_ATTR,
        });
    } finally {
        DOMPurify.removeHook("uponSanitizeAttribute");
    }
}
