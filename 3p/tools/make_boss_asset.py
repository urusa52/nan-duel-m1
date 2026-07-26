#!/usr/bin/env python3
"""보스 원화 → 스테이지용 boss_big.png 변환기.

무대의 중경(.boss-figure)에 얹을 컷아웃을 만든다.
핵심은 '직사각 경계를 지우는 것' — 네 변과 아래쪽을 알파로 녹여야
그림이 어둠 속에서 솟아난 것처럼 보인다. 경계선이 보이면 실패.

사용:
    python3 tools/make_boss_asset.py 원화.png assets/boss_big.png
옵션:
    --crop L,T,R,B   원화에서 쓸 영역(픽셀). 생략하면 전체.
    --gray           흑백(연필화)으로 변환. 컬러 원화를 무대 톤에 맞출 때.
    --contrast 1.3   대비. 연필 선이 어둠 속에서 살아나게.
    --fade-top 0.46  이 높이(0~1)부터 아래로 서서히 사라진다. 낮출수록 일찍 녹음.

출력 크기(가로:세로)가 바뀌면 m2.html 의
    .boss-figure { aspect-ratio: W/H }
한 줄만 같이 고치면 된다.
"""
import argparse
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageEnhance


def ramp(n, f):
    """0~1 위치를 밝기로 바꾸는 1픽셀짜리 그라데이션 — 알파 페이드 재료."""
    im = Image.new('L', (n, 1))
    for i in range(n):
        im.putpixel((i, 0), int(255 * max(0.0, min(1.0, f(i / n)))))
    return im


def build(src_path, out_path, crop=None, gray=True, contrast=1.30,
          upscale=1, fade_top=0.46):
    im = Image.open(src_path)
    if crop:
        im = im.crop(crop)
    if upscale != 1:
        im = im.resize((im.width * upscale, im.height * upscale), Image.LANCZOS)
        im = im.filter(ImageFilter.UnsharpMask(radius=3, percent=110, threshold=2))

    im = im.convert('L') if gray else im.convert('RGB')
    if contrast != 1.0:
        im = ImageEnhance.Contrast(im).enhance(contrast)
    w, h = im.size

    # 1) 타원 마스크 — 이미지 '안쪽'에 두고 크게 흐려야 네 변이 깨끗이 녹는다
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).ellipse((w * .06, h * .04, w * .94, h * .98), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(w * .08))

    # 2) 좌우 페이드 — 타원만으로는 모서리에 알파가 남는다
    hx = ramp(w, lambda t: (t / .14) ** 1.2 if t < .14
              else (((1 - t) / .14) ** 1.2 if t > .86 else 1))
    mask = ImageChops.multiply(mask, hx.resize((w, h)))

    # 3) 상하 페이드 — 아래는 일찍 사라져야 근경(작가)이 어둠 위에 선다
    vy = ramp(h, lambda t: (t / .07) if t < .07
              else (max(0.0, 1 - (t - fade_top) / (1 - fade_top)) ** 1.5
                    if t > fade_top else 1))
    mask = ImageChops.multiply(mask, vy.rotate(90, expand=True).resize((w, h)))

    rgb = Image.merge('RGB', (im, im, im)) if gray else im
    Image.merge('RGBA', (*rgb.split(), mask)).save(out_path)
    print(f'{out_path}  {w}x{h}   → m2.html 의 aspect-ratio:{w}/{h}')


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('src'); p.add_argument('out')
    p.add_argument('--crop')
    p.add_argument('--gray', action='store_true', default=True)
    p.add_argument('--color', dest='gray', action='store_false')
    p.add_argument('--contrast', type=float, default=1.30)
    p.add_argument('--upscale', type=int, default=1)
    p.add_argument('--fade-top', type=float, default=0.46)
    a = p.parse_args()
    build(a.src, a.out,
          crop=tuple(int(v) for v in a.crop.split(',')) if a.crop else None,
          gray=a.gray, contrast=a.contrast, upscale=a.upscale, fade_top=a.fade_top)
