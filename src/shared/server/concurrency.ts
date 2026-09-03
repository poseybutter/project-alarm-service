import "server-only";

/**
 * 항목들을 최대 `limit` 개까지만 동시에 처리하고, 결과를 입력 순서대로 돌려준다.
 *
 * 외부 API(예: Google Calendar)를 항목 수만큼 호출할 때 전부 병렬로 쏘면
 * 요청률 한도를 넘고, 전부 순차로 돌리면 실행 시간 한도에 걸린다.
 *
 * `fn` 이 거부(reject)하면 새 항목은 더 시작하지 않고 전체를 거부한다.
 * 순차 루프가 첫 실패에서 멈추는 것과 같은 동작이므로, 항목별 실패를
 * 살리려면 `fn` 안에서 잡아 결과 값으로 돌려줘야 한다.
 */
export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error(`동시 처리 한도는 1 이상의 정수여야 합니다: ${limit}`);
    }

    const results = new Array<R>(items.length);
    // 첫 실패만 담는다. (TS 가 클로저의 재할당을 추적하지 못해 배열로 둔다)
    const failures: unknown[] = [];
    let next = 0;

    const workers = Array.from(
        { length: Math.min(limit, items.length) },
        async () => {
            // next 읽기와 증가 사이에 await 가 없어 두 워커가 같은 인덱스를 잡지 않는다.
            while (failures.length === 0 && next < items.length) {
                const index = next;
                next += 1;
                try {
                    results[index] = await fn(items[index], index);
                } catch (error) {
                    if (failures.length === 0) failures.push(error);
                }
            }
        },
    );
    await Promise.all(workers);

    if (failures.length > 0) throw failures[0];
    return results;
}
