"""Read public info from a social-media link, only where a public API allows it.

TikTok and YouTube offer public oEmbed endpoints that return the video title
(often the caption) and the creator name. Other links (Instagram, private
videos) are not read; the user is asked to describe what they saw.
"""
import logging
import re

import httpx

log = logging.getLogger("gotinerary.social")

OEMBED = {
    "tiktok": "https://www.tiktok.com/oembed",
    "youtube": "https://www.youtube.com/oembed",
}


def platform_of(url: str) -> str:
    u = url.lower()
    if "tiktok.com" in u:
        return "tiktok"
    if "youtube.com" in u or "youtu.be" in u:
        return "youtube"
    if "instagram.com" in u:
        return "instagram"
    return "other"


async def read_link(url: str) -> dict:
    url = url.strip()
    if not re.match(r"^https?://", url):
        return {"platform": "other", "readable": False, "caption": "", "author": "",
                "note": "That doesn't look like a link. Describe the place you saw instead."}
    platform = platform_of(url)
    if platform == "instagram":
        return {"platform": platform, "readable": False, "caption": "", "author": "",
                "note": "Instagram doesn't let apps read reels. Add a screenshot or a screen recording of the reel below, and we'll find the places in it."}
    if platform not in OEMBED:
        return {"platform": platform, "readable": False, "caption": "", "author": "",
                "note": "We can't read this kind of link. Add a screenshot, or describe what you saw."}
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as c:
            r = await c.get(OEMBED[platform], params={"url": url, "format": "json"})
        if r.status_code == 200:
            j = r.json()
            caption = (j.get("title") or "").strip()
            return {"platform": platform, "readable": bool(caption), "caption": caption,
                    "author": j.get("author_name", ""),
                    "note": "" if caption else "The video has no caption. Please describe what you saw."}
        log.info("oEmbed %s returned %s", platform, r.status_code)
    except httpx.HTTPError as e:
        log.info("oEmbed error: %s", e)
    return {"platform": platform, "readable": False, "caption": "", "author": "",
            "note": "We couldn't read this video (it may be private). Please describe what you saw."}
