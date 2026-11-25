const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysFrom(days: number) {
    return new Date(Date.now() + days * MS_PER_DAY);
}
