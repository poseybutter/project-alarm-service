import type { GroupBase, StylesConfig } from "react-select";

export type ProjOption = { value: string; label: string };

/** react-select 공통 스타일 (프로젝트 검색·선택용) */
export const selectStyles: StylesConfig<
    ProjOption,
    false,
    GroupBase<ProjOption>
> = {
    control: (base, state) => ({
        ...base,
        fontSize: "14px",
        borderColor: state.isFocused ? "#f59e0b" : "#e7e5e4",
        borderRadius: "8px",
        boxShadow: state.isFocused ? "0 0 0 2px #fde68a" : "none",
        "&:hover": { borderColor: "#d6d3d1" },
        minHeight: "36px",
    }),
    indicatorSeparator: () => ({
        display: "none",
    }),
    dropdownIndicator: (base) => ({
        ...base,
        padding: "4px 6px",
    }),
    option: (base, state) => ({
        ...base,
        fontSize: "13px",
        backgroundColor: state.isSelected
            ? "#f59e0b"
            : state.isFocused
              ? "#fef3c7"
              : "white",
        color: state.isSelected ? "white" : "#44403c",
        cursor: "pointer",
    }),
    placeholder: (base) => ({
        ...base,
        fontSize: "12px",
        color: "#a8a29e",
    }),
    singleValue: (base) => ({
        ...base,
        fontSize: "14px",
        color: "#1c1917",
    }),
    menu: (base) => ({
        ...base,
        borderRadius: "8px",
        border: "1px solid #e7e5e4",
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        zIndex: 9999,
        width: "100%",
        minWidth: "unset",
        boxSizing: "border-box",
    }),
    menuPortal: (base) => ({
        ...base,
        zIndex: 9999,
    }),
};

/** 퀘스트·업무 모달 프로젝트 검색용 (control 42px, placeholder 14px) */
export const projectSearchSelectStyles: StylesConfig<
    ProjOption,
    false,
    GroupBase<ProjOption>
> = {
    ...selectStyles,
    control: (base, state) => ({
        ...(selectStyles.control?.(base, state) ?? base),
        minHeight: "42px",
        height: "42px",
    }),
    valueContainer: (base) => ({
        ...base,
        height: "42px",
        padding: "0 12px",
    }),
    indicatorsContainer: (base) => ({
        ...base,
        height: "42px",
    }),
    placeholder: (base, props) => ({
        ...(selectStyles.placeholder?.(base, props) ?? base),
        fontSize: "14px",
        color: "#a8a29e",
    }),
    menu: (base) => ({
        ...(selectStyles.menu?.(base, {} as never) ?? base),
        width: "100%",
        minWidth: "unset",
        boxSizing: "border-box",
    }),
};

/** 인라인 뱃지형 select (상태 변경 드롭다운).
 *  외부 wrapper에 STATUS_COLORS 같은 Tailwind 배경/텍스트 색을 입히고,
 *  react-select control은 투명 배경 + 텍스트 상속(inherit) 으로 뱃지 느낌을 유지. */
export const badgeSelectStyles: StylesConfig<
    ProjOption,
    false,
    GroupBase<ProjOption>
> = {
    control: (base) => ({
        ...base,
        background: "transparent",
        border: "none",
        boxShadow: "none",
        minHeight: "28px",
        height: "28px",
        width: "7.5rem",
        cursor: "pointer",
        "&:hover": { borderColor: "transparent" },
    }),
    valueContainer: (base) => ({
        ...base,
        padding: "0 2px 0 8px",
        height: "28px",
    }),
    indicatorSeparator: () => ({ display: "none" }),
    dropdownIndicator: (base) => ({
        ...base,
        padding: "0 4px",
        color: "currentColor",
        opacity: 0.7,
    }),
    indicatorsContainer: (base) => ({
        ...base,
        height: "28px",
    }),
    input: (base) => ({
        ...base,
        margin: 0,
        padding: 0,
        color: "inherit",
    }),
    singleValue: (base) => ({
        ...base,
        color: "inherit",
        fontSize: "12px",
        fontWeight: 500,
    }),
    placeholder: (base) => ({
        ...base,
        color: "inherit",
        opacity: 0.8,
        fontSize: "12px",
    }),
    menu: (base) => ({
        ...base,
        borderRadius: "8px",
        border: "1px solid #e7e5e4",
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        zIndex: 9999,
        width: "100%",
        minWidth: "unset",
        boxSizing: "border-box",
        backgroundColor: "#fff",
        colorScheme: "light",
    }),
    menuPortal: (base) => ({
        ...base,
        zIndex: 9999,
    }),
    option: (base, state) => ({
        ...base,
        padding: "4px 8px",
        fontSize: "12px",
        lineHeight: "1.4",
        backgroundColor: state.isSelected
            ? "#e7e5e4"
            : state.isFocused
              ? "#f5f5f4"
              : "transparent",
        color: "#1c1917",
        cursor: "pointer",
    }),
};

/** 모달 폼 내부 단일 select (이미 있는 projectSearchSelectStyles 와 동일 높이/폰트). */
export const modalFormSelectStyles: StylesConfig<
    ProjOption,
    false,
    GroupBase<ProjOption>
> = {
    ...selectStyles,
    control: (base, state) => ({
        ...(selectStyles.control?.(base, state) ?? base),
        minHeight: "42px",
        height: "42px",
        backgroundColor: "#fff",
        colorScheme: "light",
    }),
    valueContainer: (base) => ({
        ...base,
        height: "42px",
        padding: "0 12px",
    }),
    indicatorsContainer: (base) => ({
        ...base,
        height: "42px",
    }),
    singleValue: (base) => ({
        ...base,
        fontSize: "14px",
        color: "#1c1917",
    }),
    placeholder: (base, props) => ({
        ...(selectStyles.placeholder?.(base, props) ?? base),
        fontSize: "14px",
        color: "#78716c",
    }),
    menu: (base) => ({
        ...(selectStyles.menu?.(base, {} as never) ?? base),
        backgroundColor: "#fff",
        colorScheme: "light",
        width: "100%",
        minWidth: "unset",
        boxSizing: "border-box",
    }),
};

/** 업무 목록 상단 필터 — 네이티브 select와 비슷한 컴팩트 높이·text-xs 느낌 */
export const taskFilterProjectSelectStyles: StylesConfig<
    ProjOption,
    false,
    GroupBase<ProjOption>
> = {
    ...selectStyles,
    control: (base, state) => ({
        ...(selectStyles.control?.(base, state) ?? base),
        minHeight: "32px",
        height: "32px",
        fontSize: "12px",
    }),
    valueContainer: (base) => ({
        ...base,
        padding: "0 8px",
        minHeight: "30px",
    }),
    indicatorsContainer: (base) => ({
        ...base,
        height: "32px",
    }),
    dropdownIndicator: (base) => ({
        ...base,
        padding: "2px 4px",
    }),
    singleValue: (base) => ({
        ...base,
        fontSize: "12px",
        color: "#57534e",
    }),
    option: (base, state) => ({
        ...(selectStyles.option?.(base, state) ?? base),
        fontSize: "12px",
    }),
    placeholder: (base, props) => ({
        ...(selectStyles.placeholder?.(base, props) ?? base),
        fontSize: "12px",
        color: "#78716c",
    }),
    menu: (base) => ({
        ...(selectStyles.menu?.(base, {} as never) ?? base),
        width: "100%",
        minWidth: "unset",
        boxSizing: "border-box",
    }),
};
