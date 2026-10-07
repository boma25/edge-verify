#!/usr/bin/env python3
"""
Generate fictional proof-of-address test documents + ground-truth labels.

Uses the same demo account holder as the app (John Doe).
No SAMPLE watermark / "not a real record" footer — those tip small VLMs into
not_a_document. Data remains invented (not real user records).

Usage:  python3 scripts/make_synthetic.py [--seed 7]
Output: assets/synthetic/*.jpg, labels.json, index.ts
"""
from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parent.parent / "assets" / "synthetic"
GENERATED_ON = date(2026, 10, 4)  # frozen so "90 days old" means the same thing forever

# Must match src/demo/addressCatalog.ts DEMO_NAME + expected address.
DEMO_FULL_NAME = "John Doe"
DEMO_STREET = "123 Main Street"
DEMO_CITY = "Springfield"
DEMO_STATE = "IL"
# Printed on name_mismatch variants only (expected still DEMO_*).
MISMATCH_NAME = "Jane Doe"

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
FONT_CANDIDATES = {
    "sans": ["DejaVuSans.ttf", "LiberationSans-Regular.ttf", "Arial.ttf", "Helvetica.ttc"],
    "bold": ["DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf", "Arial Bold.ttf", "Helvetica.ttc"],
    "serif": ["DejaVuSerif.ttf", "LiberationSerif-Regular.ttf", "Times New Roman.ttf"],
    "mono": ["DejaVuSansMono.ttf", "LiberationMono-Regular.ttf", "Menlo.ttc", "Courier New.ttf"],
}
SEARCH_DIRS = [
    FONT_DIR,
    Path("/usr/share/fonts/truetype/liberation"),
    Path("/usr/share/fonts/liberation"),
    Path("/System/Library/Fonts"),
    Path("/System/Library/Fonts/Supplemental"),
    Path("/Library/Fonts"),
]

DOC_W, DOC_H = 820, 1160      # the "paper"
PHOTO_W, PHOTO_H = 900, 1260   # the "phone photo"

# Entirely fictional issuers.
ISSUERS = {
    "utility_bill": [("Lumen Power Distribution", "ELECTRICITY BILL", (36, 99, 170)),
                     ("Aqua Metro Water Board", "WATER BILL", (0, 120, 140))],
    "bank_statement": [("Cedar Trust Bank", "ACCOUNT STATEMENT", (30, 110, 70))],
    "tenancy_agreement": [("Harbour Estates Ltd", "TENANCY AGREEMENT", (90, 60, 40))],
    "government_letter": [("Municipal Residency Office", "CERTIFICATE OF RESIDENCE", (120, 30, 40))],
}

VARIANTS = ["clean", "mild", "stale", "future", "name_mismatch", "blurry", "cropped"]
EXPECTED_OUTCOME = {
    "clean": "approve",
    "mild": "approve",          # slightly degraded but readable: should NOT escalate
    "stale": "retry",
    "future": "retry",
    "name_mismatch": "human_review",
    "blurry": "retry",
    "cropped": "retry",
    "not_document": "retry",
}


def find_font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    for d in SEARCH_DIRS:
        for name in FONT_CANDIDATES[kind]:
            p = d / name
            if p.exists():
                return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


@dataclass
class Profile:
    full: str
    street: str
    city: str
    state: str
    doc_type: str
    issuer: str
    title: str
    color: tuple


def demo_profile(rng: random.Random) -> Profile:
    """Single account holder shared with the in-app demo expected fields."""
    doc_type = "utility_bill"
    issuer, title, color = ISSUERS[doc_type][0]
    return Profile(
        DEMO_FULL_NAME,
        DEMO_STREET,
        DEMO_CITY,
        DEMO_STATE,
        doc_type,
        issuer,
        title,
        color,
    )


def fmt_date(d: date, rng: random.Random) -> str:
    # Numeric DD/MM/YYYY only when the day is > 12 so it is unambiguous.
    styles = ["%d %b %Y", "%B %d, %Y"] + (["%d/%m/%Y"] if d.day > 12 else [])
    return d.strftime(rng.choice(styles))


def digits(rng: random.Random, n: int) -> str:
    return "".join(str(rng.randint(0, 9)) for _ in range(n))


def money(rng: random.Random, lo: int, hi: int) -> str:
    return f"NGN {rng.randint(lo, hi):,}.{rng.randint(0, 99):02d}"


def wrap(draw: ImageDraw.ImageDraw, text: str, font, max_w: int) -> list[str]:
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


# --------------------------------------------------------------------------- #
# Page rendering
# --------------------------------------------------------------------------- #
def render_page(p: Profile, holder: str, issued: date, rng: random.Random) -> Image.Image:
    img = Image.new("RGB", (DOC_W, DOC_H), (252, 251, 247))
    d = ImageDraw.Draw(img)
    f_title, f_h, f_b, f_s, f_m = (find_font("bold", 30), find_font("bold", 22),
                                   find_font("sans", 21), find_font("sans", 16), find_font("mono", 18))

    # Header band
    d.rectangle([0, 0, DOC_W, 120], fill=p.color)
    d.text((40, 28), p.issuer.upper(), font=f_h, fill="white")
    d.text((40, 66), p.title, font=f_b, fill=(235, 235, 235))

    # Account holder block: deliberately in the TOP third (the "cropped" variant removes it)
    y = 160
    d.text((40, y), "ACCOUNT HOLDER" if p.doc_type != "tenancy_agreement" else "TENANT", font=f_s, fill=(110, 110, 110))
    d.text((40, y + 26), holder, font=f_h, fill=(20, 20, 20))
    d.text((40, y + 58), p.street, font=f_b, fill=(30, 30, 30))
    d.text((40, y + 88), f"{p.city}, {p.state} State", font=f_b, fill=(30, 30, 30))

    date_label = {"utility_bill": "Bill date", "bank_statement": "Statement date",
                  "tenancy_agreement": "Dated", "government_letter": "Date of issue"}[p.doc_type]
    d.text((DOC_W - 330, y), date_label.upper(), font=f_s, fill=(110, 110, 110))
    d.text((DOC_W - 330, y + 26), fmt_date(issued, rng), font=f_h, fill=(20, 20, 20))
    d.text((DOC_W - 330, y + 66), f"Ref: {digits(rng, 10)}", font=f_m, fill=(90, 90, 90))

    d.line([40, 290, DOC_W - 40, 290], fill=(200, 200, 200), width=2)

    body_y = 320
    if p.doc_type == "utility_bill":
        rows = [("Previous reading", f"{rng.randint(1000, 9000)} kWh"),
                ("Current reading", f"{rng.randint(9001, 20000)} kWh"),
                ("Energy charge", money(rng, 8000, 45000)),
                ("Service charge", money(rng, 1500, 4000)),
                ("VAT", money(rng, 600, 3500)),
                ("Meter no.", digits(rng, 11)),
                ("Account no.", digits(rng, 10))]
        for i, (k, v) in enumerate(rows):
            yy = body_y + i * 44
            d.text((40, yy), k, font=f_b, fill=(60, 60, 60))
            d.text((DOC_W - 40 - d.textlength(v, font=f_m), yy), v, font=f_m, fill=(20, 20, 20))
            d.line([40, yy + 34, DOC_W - 40, yy + 34], fill=(232, 232, 232), width=1)
        d.rectangle([40, body_y + 7 * 44 + 30, DOC_W - 40, body_y + 7 * 44 + 110], outline=p.color, width=3)
        d.text((60, body_y + 7 * 44 + 50), "AMOUNT DUE", font=f_h, fill=p.color)
        total = money(rng, 12000, 90000)
        d.text((DOC_W - 60 - d.textlength(total, font=f_title), body_y + 7 * 44 + 42), total, font=f_title, fill=(20, 20, 20))

    elif p.doc_type == "bank_statement":
        d.text((40, body_y), f"Account no. {digits(rng, 10)}     Currency: NGN", font=f_m, fill=(60, 60, 60))
        d.text((40, body_y + 40), "Date", font=f_s, fill=(110, 110, 110))
        d.text((190, body_y + 40), "Description", font=f_s, fill=(110, 110, 110))
        d.text((DOC_W - 200, body_y + 40), "Amount", font=f_s, fill=(110, 110, 110))
        descs = ["Transfer in", "POS purchase", "Airtime top-up", "Salary credit", "ATM withdrawal",
                 "Utility payment", "Transfer out", "Market purchase", "Data subscription"]
        for i in range(11):
            yy = body_y + 74 + i * 40
            dd = issued - timedelta(days=rng.randint(1, 28))
            d.text((40, yy), dd.strftime("%d %b"), font=f_s, fill=(60, 60, 60))
            d.text((190, yy), rng.choice(descs), font=f_s, fill=(30, 30, 30))
            amt = money(rng, 500, 150000)
            d.text((DOC_W - 40 - d.textlength(amt, font=f_m), yy), amt, font=f_m, fill=(20, 20, 20))
            d.line([40, yy + 30, DOC_W - 40, yy + 30], fill=(235, 235, 235), width=1)

    elif p.doc_type == "tenancy_agreement":
        paras = [
            f"This agreement is made on {fmt_date(issued, rng)} between {p.issuer} (the Landlord) "
            f"and {holder} (the Tenant) for the premises at {p.street}, {p.city}, {p.state} State.",
            "The Tenant shall pay rent annually in advance and keep the premises in good repair. "
            "The Landlord shall not enter the premises without reasonable notice.",
            "Either party may end this agreement by giving three months written notice. "
            "This agreement is governed by the laws of the Federal Republic of Nigeria.",
            "Signed by both parties on the date written above.",
        ]
        yy = body_y
        for para in paras:
            for line in wrap(d, para, f_b, DOC_W - 80):
                d.text((40, yy), line, font=f_b, fill=(30, 30, 30))
                yy += 32
            yy += 22
        d.line([40, yy + 60, 320, yy + 60], fill=(40, 40, 40), width=2)
        d.line([DOC_W - 320, yy + 60, DOC_W - 40, yy + 60], fill=(40, 40, 40), width=2)
        d.text((40, yy + 70), "Landlord", font=f_s, fill=(90, 90, 90))
        d.text((DOC_W - 320, yy + 70), "Tenant", font=f_s, fill=(90, 90, 90))

    else:  # government_letter
        paras = [
            f"TO WHOM IT MAY CONCERN",
            f"This is to confirm that {holder} is a resident at {p.street}, {p.city}, {p.state} State, "
            "and has lived at this address for more than six months.",
            "This letter is issued on request for the purpose of address confirmation only "
            "and is valid for ninety days from the date of issue.",
        ]
        yy = body_y
        for k, para in enumerate(paras):
            for line in wrap(d, para, f_h if k == 0 else f_b, DOC_W - 80):
                d.text((40, yy), line, font=f_h if k == 0 else f_b, fill=(30, 30, 30))
                yy += 34
            yy += 26
        d.line([40, yy + 90, 300, yy + 90], fill=(40, 40, 40), width=2)
        d.text((40, yy + 100), "Registrar", font=f_s, fill=(90, 90, 90))

    return img


# --------------------------------------------------------------------------- #
# "Phone photo" simulation
# --------------------------------------------------------------------------- #
def table_background(rng: random.Random, nprng: np.random.Generator) -> Image.Image:
    base = np.array(rng.choice([(122, 92, 66), (96, 98, 102), (168, 150, 120), (70, 78, 74), (150, 120, 96)]),
                    dtype=np.float32)
    h, w = PHOTO_H, PHOTO_W
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    grain = np.sin(xx / rng.uniform(5, 11) + nprng.normal(0, 0.4, (h, w))) * 7
    light = 1.0 - 0.18 * (((xx - w * 0.4) / w) ** 2 + ((yy - h * 0.35) / h) ** 2) * 2
    arr = base[None, None, :] * light[..., None] + grain[..., None] + nprng.normal(0, 4, (h, w, 3))
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


def add_noise(img: Image.Image, sigma: float, nprng: np.random.Generator) -> Image.Image:
    arr = np.asarray(img).astype(np.float32) + nprng.normal(0, sigma, (img.height, img.width, 3))
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


def photograph(page: Image.Image | None, variant: str, rng: random.Random, nprng: np.random.Generator) -> Image.Image:
    bg = table_background(rng, nprng)
    if page is None:  # "not a document": a few objects on a table
        d = ImageDraw.Draw(bg)
        for _ in range(rng.randint(3, 6)):
            x, y = rng.randint(40, PHOTO_W - 200), rng.randint(60, PHOTO_H - 240)
            w, h = rng.randint(80, 260), rng.randint(60, 220)
            col = tuple(rng.randint(30, 220) for _ in range(3))
            if rng.random() < 0.5:
                d.ellipse([x, y, x + w, y + h], fill=col)
            else:
                d.rounded_rectangle([x, y, x + w, y + h], radius=18, fill=col)
        return add_noise(bg, 4, nprng).filter(ImageFilter.GaussianBlur(0.8))

    if variant == "cropped":
        # The user framed only the bottom of the page: name/address block is missing.
        page = page.crop((0, int(DOC_H * 0.43), DOC_W, DOC_H))

    scale = (PHOTO_W * 0.86) / page.width
    page = page.resize((int(page.width * scale), int(page.height * scale)), Image.Resampling.LANCZOS)
    angle = rng.uniform(-3, 3) if variant != "mild" else rng.choice([-1, 1]) * rng.uniform(3, 5)
    rgba = page.convert("RGBA").rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)

    x = (PHOTO_W - rgba.width) // 2 + rng.randint(-12, 12)
    y = max(10, (PHOTO_H - rgba.height) // 2 + rng.randint(-20, 20))

    shadow = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle([x + 10, y + 14, x + rgba.width + 10, y + rgba.height + 14], fill=(0, 0, 0, 110))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    canvas = Image.alpha_composite(bg.convert("RGBA"), shadow)
    canvas.paste(rgba, (x, y), rgba)
    out = canvas.convert("RGB")

    if variant == "clean":
        out = add_noise(out, 3, nprng)
    elif variant == "mild":
        out = out.filter(ImageFilter.GaussianBlur(1.1))
        out = ImageEnhance.Brightness(out).enhance(0.86)
        out = add_noise(out, 6, nprng)
    elif variant == "blurry":
        out = out.filter(ImageFilter.GaussianBlur(7.5))
        out = out.resize((PHOTO_W // 2, PHOTO_H // 2), Image.Resampling.BILINEAR).resize(
            (PHOTO_W, PHOTO_H), Image.Resampling.BILINEAR)
        out = add_noise(out, 7, nprng)
    else:  # stale / future / name_mismatch / cropped: ordinary capture quality
        out = add_noise(out, 3, nprng)
    return out


# --------------------------------------------------------------------------- #
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--nodoc", type=int, default=3, help="how many no-document photos to generate")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    nprng = np.random.default_rng(args.seed)
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.jpg"):
        old.unlink()

    p = demo_profile(rng)
    labels: list[dict] = []

    def save(img: Image.Image, name: str) -> None:
        img.save(OUT / f"{name}.jpg", "JPEG", quality=78, optimize=True)

    for variant in VARIANTS:
        holder = MISMATCH_NAME if variant == "name_mismatch" else p.full
        if variant == "stale":
            issued = GENERATED_ON - timedelta(days=rng.randint(150, 400))
        elif variant == "future":
            issued = GENERATED_ON + timedelta(days=rng.randint(20, 120))
        else:
            issued = GENERATED_ON - timedelta(days=rng.randint(5, 60))

        page = render_page(p, holder, issued, rng)
        ident = f"addr-01-{variant}"
        save(photograph(page, variant, rng, nprng), ident)

        visible = variant not in ("blurry", "cropped")
        labels.append({
            "id": ident,
            "file": f"{ident}.jpg",
            "kind": "address",
            "variant": variant,
            "expected": {"fullName": p.full, "city": p.city, "state": p.state},
            "truth": {
                "documentType": p.doc_type,
                "fullName": holder,
                "addressLine": p.street,
                "city": p.city,
                "state": p.state,
                "issueDate": issued.isoformat(),
                "issuer": p.issuer,
            },
            # Field accuracy is only meaningful where every field is actually legible.
            "fieldsVisible": visible,
            "expectedOutcome": EXPECTED_OUTCOME[variant],
        })

    # Photos with no document at all.
    for k in range(1, max(1, args.nodoc) + 1):
        ident = f"addr-nodoc-{k:02d}"
        save(photograph(None, "not_document", rng, nprng), ident)
        labels.append({
            "id": ident, "file": f"{ident}.jpg", "kind": "address", "variant": "not_document",
            "expected": {"fullName": p.full, "city": p.city, "state": p.state},
            "truth": {"documentType": "not_a_document", "fullName": None, "addressLine": None, "city": None,
                      "state": None, "issueDate": None, "issuer": None},
            "fieldsVisible": False,
            "expectedOutcome": EXPECTED_OUTCOME["not_document"],
        })

    (OUT / "labels.json").write_text(json.dumps(
        {"generatedOn": GENERATED_ON.isoformat(), "seed": args.seed, "items": labels}, indent=2))

    # Metro needs static require() calls, so generate them.
    lines = [
        "// AUTO-GENERATED by scripts/make_synthetic.py. Do not edit by hand.",
        f"export const GENERATED_ON = '{GENERATED_ON.isoformat()}';",
        "export const SYNTHETIC_IMAGES: Record<string, number> = {",
    ]
    for item in labels:
        lines.append(f"  '{item['id']}': require('./{item['file']}'),")
    lines.append("};")
    (OUT / "index.ts").write_text("\n".join(lines) + "\n")

    sizes = sum(f.stat().st_size for f in OUT.glob("*.jpg"))
    by_outcome: dict[str, int] = {}
    for item in labels:
        by_outcome[item["expectedOutcome"]] = by_outcome.get(item["expectedOutcome"], 0) + 1
    print(f"wrote {len(labels)} images ({sizes / 1e6:.1f} MB) to {OUT}")
    print("expected outcomes:", by_outcome)


if __name__ == "__main__":
    main()
