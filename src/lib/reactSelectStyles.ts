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
    }),
    menuPortal: (base) => ({
        ...base,
        zIndex: 9999,
    }),
};
