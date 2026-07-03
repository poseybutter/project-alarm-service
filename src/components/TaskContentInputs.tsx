"use client";

type TaskContentInputsProps = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
};

function splitContent(value: string) {
    return value.length > 0 ? value.split("\n") : [""];
}

export default function TaskContentInputs({
    value,
    onChange,
    placeholder = "업무 내용을 입력하세요",
}: TaskContentInputsProps) {
    const lines = splitContent(value);

    function updateLine(index: number, nextValue: string) {
        const next = [...lines];
        next[index] = nextValue;
        onChange(next.join("\n"));
    }

    function addLine() {
        onChange([...lines, ""].join("\n"));
    }

    function removeLine(index: number) {
        const next = lines.filter((_, lineIndex) => lineIndex !== index);
        onChange((next.length > 0 ? next : [""]).join("\n"));
    }

    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="block text-xs font-medium text-stone-500">
                    업무 내용
                </label>
                <button
                    type="button"
                    onClick={addLine}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 shadow-sm hover:border-amber-300 hover:text-amber-600"
                    aria-label="업무 내용 추가"
                    title="업무 내용 추가"
                >
                    <i className="ri-add-line text-base" />
                </button>
            </div>
            <div className="space-y-2">
                {lines.map((line, index) => (
                    <div key={index} className="flex items-center gap-2">
                        <input
                            className="min-w-0 flex-1 rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
                            placeholder={index === 0 ? placeholder : "업무 내용 추가"}
                            value={line}
                            onChange={(event) =>
                                updateLine(index, event.target.value)
                            }
                        />
                        <button
                            type="button"
                            onClick={() => removeLine(index)}
                            disabled={lines.length === 1}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-400 shadow-sm hover:border-red-200 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-35"
                            aria-label="업무 내용 삭제"
                            title="업무 내용 삭제"
                        >
                            <i className="ri-subtract-line text-base" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
