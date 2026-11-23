/* Dependency-free DOCX writer (Office Open XML in a stored ZIP). */
BS.docx = (function () {
  const enc = new TextEncoder();
  const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  /* ---------- zip ---------- */
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zip(files, type) {
    const parts = [], central = [];
    let offset = 0;
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((n, p) => n + p.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, size, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: type || 'application/zip' });
  }

  /* ---------- xml helpers ---------- */
  const x = (s) => String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function run(text, f) {
    let pr = '';
    if (f.b) pr += '<w:b/><w:bCs/>';
    if (f.i) pr += '<w:i/><w:iCs/>';
    if (f.hl) pr += '<w:highlight w:val="yellow"/>';
    return '<w:r>' + (pr ? '<w:rPr>' + pr + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + x(text) + '</w:t></w:r>';
  }
  function runs(node, fmt, out, opts) {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { if (n.nodeValue) out.push(run(n.nodeValue, fmt)); continue; }
      if (n.nodeType !== 1) continue;
      if (n.nodeName === 'BR') { out.push('<w:r><w:br/></w:r>'); continue; }
      const f = Object.assign({}, fmt);
      if (n.nodeName === 'STRONG' || n.nodeName === 'B') f.b = 1;
      if (n.nodeName === 'EM' || n.nodeName === 'I') f.i = 1;
      if (n.nodeName === 'MARK' && opts.highlights) f.hl = 1;
      runs(n, f, out, opts);
    }
    return out.join('');
  }
  const para = (style, inner, ppr) => '<w:p><w:pPr>' + (style ? '<w:pStyle w:val="' + style + '"/>' : '') + (ppr || '') + '</w:pPr>' + (inner || '') + '</w:p>';
  const textPara = (style, text) => para(style, run(text, {}));

  /* ---------- body ---------- */
  // manuscript: { title, subtitle, author, titlePage, items: [{kind:'chapter'|'section'|'html', title, level, html}] }
  function body(ms, opts, numbering) {
    const out = [];
    if (ms.titlePage) {
      out.push(textPara('Title', ms.title));
      if (ms.subtitle) out.push(textPara('Subtitle', ms.subtitle));
      if (ms.author) out.push(textPara('Author', ms.author));
      // the first chapter heading starts a new page via its pageBreakBefore style
    }
    let afterHeading = true;
    let first = true;
    for (const it of ms.items) {
      if (it.kind === 'chapter') {
        out.push(para('Heading1', run(it.title, {}), first && !ms.titlePage ? '<w:pageBreakBefore w:val="0"/>' : ''));
        first = false;
        afterHeading = true;
        continue;
      }
      if (it.kind === 'section') {
        out.push(textPara(it.level === 2 ? 'Heading3' : 'Heading2', it.title));
        afterHeading = true;
        continue;
      }
      const t = document.createElement('template');
      t.innerHTML = it.html || '';
      for (const b of t.content.children) {
        const tag = b.nodeName;
        if (tag === 'H2' || tag === 'H3') {
          out.push(para(tag === 'H2' ? 'Heading4' : 'Heading5', runs(b, {}, [], opts)));
          afterHeading = true;
        } else if (tag === 'BLOCKQUOTE') {
          const ps = b.querySelectorAll('p');
          (ps.length ? Array.from(ps) : [b]).forEach((p) => out.push(para('Quote', runs(p, {}, [], opts))));
          afterHeading = false;
        } else if (tag === 'UL' || tag === 'OL') {
          const id = tag === 'UL' ? 1 : numbering.next();
          b.querySelectorAll('li').forEach((li) => out.push(para('ListParagraph', runs(li, {}, [], opts), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="' + id + '"/></w:numPr>')));
          afterHeading = false;
        } else {
          const text = b.textContent.trim();
          if (!text && !opts.keepEmpty) continue;
          if (/^(\*\s*){3}$|^#$|^~$|^(\*\s?){1,3}$/.test(text)) { out.push(textPara('SceneBreak', text)); afterHeading = true; continue; }
          out.push(para(afterHeading ? 'FirstParagraph' : 'BodyText', runs(b, {}, [], opts)));
          afterHeading = false;
        }
      }
    }
    return out.join('');
  }

  /* ---------- styles ---------- */
  function styles(p) {
    const font = '<w:rFonts w:ascii="' + p.font + '" w:hAnsi="' + p.font + '" w:cs="' + p.font + '" w:eastAsia="' + p.font + '"/>';
    const st = (id, name, ppr, rpr, extra) => '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + name + '"/><w:basedOn w:val="Normal"/><w:next w:val="BodyText"/>' + (extra || '') + '<w:qFormat/><w:pPr>' + (ppr || '') + '</w:pPr><w:rPr>' + (rpr || '') + '</w:rPr></w:style>';
    const heading = (lvl, size, ppr, rpr) => st('Heading' + lvl, 'heading ' + lvl, '<w:keepNext/><w:keepLines/>' + ppr + '<w:outlineLvl w:val="' + (lvl - 1) + '"/>', '<w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/>' + rpr);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="' + NS_W + '">' +
      '<w:docDefaults><w:rPrDefault><w:rPr>' + font + '<w:sz w:val="' + p.size + '"/><w:szCs w:val="' + p.size + '"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="' + p.line + '" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      st('BodyText', 'Body Text', '<w:ind w:firstLine="' + p.indent + '"/>' + (p.justify ? '<w:jc w:val="both"/>' : '')) +
      st('FirstParagraph', 'First Paragraph', p.justify ? '<w:jc w:val="both"/>' : '') +
      st('Title', 'Title', '<w:spacing w:before="3600" w:after="360"/><w:jc w:val="center"/>', '<w:sz w:val="56"/><w:szCs w:val="56"/>') +
      st('Subtitle', 'Subtitle', '<w:spacing w:after="720"/><w:jc w:val="center"/>', '<w:i/><w:sz w:val="30"/><w:szCs w:val="30"/>') +
      st('Author', 'Author', '<w:jc w:val="center"/>', '<w:sz w:val="26"/><w:szCs w:val="26"/>') +
      heading(1, 36, '<w:pageBreakBefore/><w:spacing w:before="2400" w:after="720"/><w:jc w:val="center"/>', '') +
      heading(2, 28, '<w:spacing w:before="480" w:after="240"/>', '<w:b/><w:bCs/>') +
      heading(3, 25, '<w:spacing w:before="360" w:after="180"/>', '<w:b/><w:bCs/>') +
      heading(4, 24, '<w:spacing w:before="320" w:after="160"/>', '<w:b/><w:bCs/>') +
      heading(5, 23, '<w:spacing w:before="280" w:after="120"/>', '<w:b/><w:bCs/><w:i/><w:iCs/>') +
      st('Quote', 'Quote', '<w:spacing w:before="160" w:after="160"/><w:ind w:left="720" w:right="720"/>', '<w:i/><w:iCs/>') +
      st('SceneBreak', 'Scene Break', '<w:spacing w:before="240" w:after="240"/><w:jc w:val="center"/>') +
      st('ListParagraph', 'List Paragraph', '<w:ind w:left="720"/><w:contextualSpacing/>') +
      '<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>' +
      '</w:styles>';
  }

  function numberingXml(count) {
    const lvl = (fmt, text) => '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="' + fmt + '"/><w:lvlText w:val="' + text + '"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>';
    let nums = '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>';
    for (let i = 2; i <= count; i++) nums += '<w:num w:numId="' + i + '"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="' + NS_W + '">' +
      '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/>' + lvl('bullet', '•') + '</w:abstractNum>' +
      '<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/>' + lvl('decimal', '%1.') + '</w:abstractNum>' +
      nums + '</w:numbering>';
  }

  const PRESETS = {
    book: { font: 'Georgia', size: 23, line: 324, indent: 360, justify: true },
    manuscript: { font: 'Times New Roman', size: 24, line: 480, indent: 720, justify: false }
  };
  const PAGES = { A4: { w: 11906, h: 16838 }, Letter: { w: 12240, h: 15840 } };

  function build(ms, opts) {
    opts = Object.assign({ preset: 'book', page: 'A4', highlights: false, pageNumbers: true }, opts || {});
    const p = PRESETS[opts.preset] || PRESETS.book;
    const pg = PAGES[opts.page] || PAGES.A4;
    let numCount = 1;
    const numbering = { next: () => ++numCount };
    const content = body(ms, opts, numbering);
    const sect = '<w:sectPr>' + (opts.pageNumbers ? '<w:footerReference w:type="default" r:id="rId3"/>' : '') +
      '<w:pgSz w:w="' + pg.w + '" w:h="' + pg.h + '"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
      (ms.titlePage ? '<w:titlePg/>' : '') + '</w:sectPr>';
    const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="' + NS_W + '" xmlns:r="' + NS_R + '"><w:body>' + content + sect + '</w:body></w:document>';
    const footer = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="' + NS_W + '" xmlns:r="' + NS_R + '"><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr>' +
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>';
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + x(ms.title) + '</dc:title>' + (ms.author ? '<dc:creator>' + x(ms.author) + '</dc:creator>' : '') +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified></cp:coreProperties>';
    const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
    const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>';
    return zip([
      { name: '[Content_Types].xml', data: ct },
      { name: '_rels/.rels', data: rels },
      { name: 'docProps/core.xml', data: core },
      { name: 'word/document.xml', data: doc },
      { name: 'word/styles.xml', data: styles(p) },
      { name: 'word/numbering.xml', data: numberingXml(numCount) },
      { name: 'word/footer1.xml', data: footer },
      { name: 'word/_rels/document.xml.rels', data: docRels }
    ], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }

  return { build, zip, crc32 };
})();
