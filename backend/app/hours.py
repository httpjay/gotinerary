"""Opening-hours logic (rule-based, no AI).

Google gives weekly "periods": open {day, hour, minute} and close {...},
where day 0 = Sunday. We turn them into open windows (in minutes from
midnight) for one calendar date, then check whether a visit fits.
"""
from datetime import date

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def google_weekday(iso: str) -> int:
    return (date.fromisoformat(iso).weekday() + 1) % 7  # Python Monday=0 -> Google Sunday=0


def weekday_name(iso: str) -> str:
    return DAY_NAMES[date.fromisoformat(iso).weekday()]


def windows_for(periods: list[dict], iso: str):
    """Open windows on this date as [(start_min, end_min)].

    Returns None when hours are unknown, [] when closed all day.
    """
    if not periods:
        return None
    gday = google_weekday(iso)
    out = []
    for p in periods:
        o, c = p.get("open"), p.get("close")
        if not o:
            continue
        if c is None:  # open 24 hours, every day
            return [(0, 24 * 60)]
        od, cd = o.get("day", 0), c.get("day", 0)
        start = o.get("hour", 0) * 60 + o.get("minute", 0)
        end = c.get("hour", 0) * 60 + c.get("minute", 0)
        if od == gday:
            if cd != od:  # closes after midnight
                end += 24 * 60 * ((cd - od) % 7)
            out.append((start, end))
        elif cd == gday and cd != od and end > 0:  # still open from the night before
            out.append((0, end))
    return sorted(out)


def fit(windows, begin: int, duration: int):
    """Find when a visit can happen.

    Returns (start_min, note). start_min is None if it cannot fit today.
    """
    if windows is None:
        return begin, "unknown"
    if not windows:
        return None, "closed"
    for s, e in windows:
        start = max(begin, s)
        if start + duration <= e:
            return start, ("wait" if start > begin else "ok")
    last_end = max(e for _, e in windows)
    if begin >= last_end:
        return None, "too_late"
    return None, "too_short"


def fmt(minutes: int) -> str:
    minutes %= 24 * 60
    h, m = divmod(minutes, 60)
    ampm = "PM" if h >= 12 else "AM"
    return f"{h % 12 or 12}:{m:02d} {ampm}"


def describe(windows) -> str:
    if windows is None:
        return "Hours not available"
    if not windows:
        return "Closed this day"
    if windows == [(0, 24 * 60)]:
        return "Open 24 hours"
    return ", ".join(f"{fmt(s)} to {fmt(e)}" for s, e in windows)
