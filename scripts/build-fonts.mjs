// Converts the subset web fonts in scripts/ into three.js typeface JSON so the
// 3D scenes can extrude real glyphs (眞善美, 벗, years) without shipping opentype.
// Same conversion as three's TTFLoader, which can't run in Node (CDN import).
import { readFileSync, writeFileSync } from 'node:fs';
import opentype from 'opentype.js';

function convert(font) {
  const round = Math.round;
  const scale = 100000 / ((font.unitsPerEm || 2048) * 72);
  const glyphs = {};
  const map = font.encoding.cmap.glyphIndexMap;
  for (const code of Object.keys(map)) {
    const glyph = font.glyphs.get(map[code]);
    const token = { ha: round(glyph.advanceWidth * scale), x_min: round(glyph.xMin * scale), x_max: round(glyph.xMax * scale), o: '' };
    for (const c of glyph.path.commands) {
      const type = c.type.toLowerCase() === 'c' ? 'b' : c.type.toLowerCase();
      token.o += type + ' ';
      for (const [x, y] of [['x', 'y'], ['x1', 'y1'], ['x2', 'y2']])
        if (c[x] !== undefined && c[y] !== undefined) token.o += round(c[x] * scale) + ' ' + round(c[y] * scale) + ' ';
    }
    glyphs[String.fromCodePoint(+code)] = token;
  }
  return {
    glyphs,
    familyName: font.getEnglishName('fullName'),
    ascender: round(font.ascender * scale),
    descender: round(font.descender * scale),
    underlinePosition: font.tables.post.underlinePosition,
    underlineThickness: font.tables.post.underlineThickness,
    boundingBox: { xMin: font.tables.head.xMin, xMax: font.tables.head.xMax, yMin: font.tables.head.yMin, yMax: font.tables.head.yMax },
    resolution: 1000,
  };
}

for (const [src, out] of [['serif-kr.ttf', 'serif-kr.json'], ['cormorant.ttf', 'cormorant.json']]) {
  const buf = readFileSync(new URL(src, import.meta.url));
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const json = convert(font);
  writeFileSync(new URL(`../public/fonts/${out}`, import.meta.url), JSON.stringify(json));
  console.log(out, Object.keys(json.glyphs).join(''));
}
