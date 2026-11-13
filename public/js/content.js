// Website content model, shared by the public pages and the Lab Dashboard (admin.html).
//
// DEFAULTS is the content the site shipped with. Anything published from the dashboard is stored in
// Firestore (content/{section}) and replaces the matching section here. Publications and News also
// pick up what scripts/update_scholar.py adds to js/data.js (new papers, fresh citation counts).
// Loaded as a classic script after data.js and scholar.js; everything lives on window.LAB.
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const stripTags = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');

  // ------------------------------------------------------------------ rich text
  // Editors may type a little markup: **bold**, *italic*, [link text](https://…), H_{2}O, Ca^{2+},
  // or the same as HTML (<b>, <em>, <sub>, <sup>, <a href>). Everything else is shown as text.
  const ALLOWED = { A: 'a', B: 'b', STRONG: 'strong', EM: 'em', I: 'em', SUB: 'sub', SUP: 'sup', BR: 'br', SMALL: 'small' };
  const safeHref = (href) => {
    const v = String(href || '').trim();
    if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
    if (/^[a-z0-9._\-/#?=&%()]+$/i.test(v) && !/^\/\//.test(v) && !/^[a-z]+:/i.test(v)) return v; // relative link
    return '';
  };
  function markup(text) {
    return String(text ?? '')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${esc(u)}">${t}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/_\{([^}]{1,20})\}/g, '<sub>$1</sub>')
      .replace(/\^\{([^}]{1,20})\}/g, '<sup>$1</sup>');
  }
  // Sanitizes in the browser; on the server (bake script) it is never called.
  function inline(text) {
    const source = markup(text);
    if (typeof document === 'undefined') return esc(stripTags(source));
    const tpl = document.createElement('template');
    tpl.innerHTML = source;
    const walk = (node) => {
      let out = '';
      for (const child of node.childNodes) {
        if (child.nodeType === 3) out += esc(child.textContent);
        else if (child.nodeType === 1) {
          const tag = ALLOWED[child.tagName];
          if (!tag) out += walk(child);
          else if (tag === 'br') out += '<br>';
          else if (tag === 'a') {
            const href = safeHref(child.getAttribute('href'));
            const external = /^https?:/i.test(href);
            out += href ? `<a href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${walk(child)}</a>` : walk(child);
          } else out += `<${tag}>${walk(child)}</${tag}>`;
        }
      }
      return out;
    };
    return walk(tpl.content);
  }
  /** Paragraphs separated by a blank line; single line breaks are kept. */
  const paras = (text, cls = '') =>
    String(text ?? '')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p${cls ? ` class="${cls}"` : ''}>${inline(p).replace(/\n/g, '<br>')}</p>`)
      .join('');
  const lines = (text) => String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

  // ------------------------------------------------------------------ keys used to match Scholar items
  const norm = (s) => stripTags(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const pubKey = (p) => {
    const doi = String(p.url || '').match(/doi\.org\/(.+)$/i);
    return doi ? 'doi:' + doi[1].toLowerCase() : 't:' + norm(p.title).slice(0, 120);
  };
  const newsKey = (n) => 'n:' + norm(n.text).slice(0, 120);

  // ------------------------------------------------------------------ baseline from data.js (kept up to date by the Scholar workflow)
  const g = typeof window !== 'undefined' ? window : globalThis;
  const PUBS_ = typeof PUBS !== 'undefined' ? PUBS : g.PUBS || [];
  const NEWS_ = typeof NEWS !== 'undefined' ? NEWS : g.NEWS || [];
  const TEAM_ = typeof TEAM !== 'undefined' ? TEAM : g.TEAM || [];
  const COURSES_ = typeof COURSES !== 'undefined' ? COURSES : g.COURSES || [];
  const LINKS_ = typeof LINKS !== 'undefined' ? LINKS : g.LINKS || {};
  const LINK_NAMES = { scholar: 'Google Scholar', researchgate: 'ResearchGate', orcid: 'ORCID', gstu: 'GSTU Faculty Page', linkedin: 'LinkedIn' };

  const basePubs = PUBS_.map(([year, type, cites, title, authors, venue, url]) => ({ year, type, cites: cites || 0, title, authors, venue, url: url || '', featured: false }));
  const baseNews = NEWS_.map(([date, tag, text]) => ({ date, tag, text, link: '' }));

  // ------------------------------------------------------------------ defaults (the content the site shipped with)
  const DEFAULTS = {
    site: {
      name: 'AFMN Lab',
      fullName: 'Advanced Functional Materials and Nanotechnology Laboratory',
      university: 'Gopalganj Science and Technology University',
      department: 'Department of Applied Chemistry and Chemical Engineering',
      orgShort: 'ACCE · GSTU',
      piName: 'Prof. Md. Kamruzzaman',
      piTitle: 'Professor & Chairman, Dept. of ACCE',
      email: 'mkamruzzamandu81@gmail.com',
      phone: '+880 1777 656796',
      universityPhone: '+880 2 6682257',
      universityPhoneNote: "Registrar's office, GSTU",
      address: 'Room 204, Academic Building (Old)\nDepartment of Applied Chemistry and Chemical Engineering\nGopalganj Science and Technology University\nGopalganj 8105, Bangladesh',
      mapLat: '23.0167',
      mapLon: '89.8406',
      contactIntro: 'Get in touch with the AFMN Lab through its Principal Investigator, Prof. Md. Kamruzzaman.',
      contactButton: 'Get in touch with the lab',
      links: Object.entries(LINKS_).filter(([, u]) => u).map(([k, url]) => ({ label: LINK_NAMES[k] || k, url })),
      cvUrl: 'CV-%20Dr.%20Kamruzzaman(2).pdf',
    },
    notices: { items: [] },
    home: {
      heroLabel: 'Advanced Functional Materials and Nanotechnology Laboratory · GSTU',
      heroTitle: 'AFMN Lab',
      heroText:
        'The Advanced Functional Materials and Nanotechnology (AFMN) Laboratory at Gopalganj Science and Technology University designs <em>MXene, carbon-nitride and graphene nanocomposites</em> in biodegradable polymers for UV protection, food packaging and clean water, and develops nanoparticle-enhanced luminescence methods for measuring molecules at trace levels.',
      heroImage: 'images/Homepagemain.jpg',
      heroImageAlt: 'Illustration of a fullerene-like carbon nanostructure',
      heroCaption: 'Functional nanomaterials',
      heroCaption2: 'AFMN Lab, GSTU',
      researchIntro: 'Five connected programmes in the Advanced Functional Materials and Nanotechnology (AFMN) Laboratory, from nanosheet synthesis to applied analysis.',
      groupIntro: 'Research members working with Prof. Kamruzzaman in the AFMN Laboratory.',
      showChapters: true,
      showStats: true,
      pubCount: 5,
      newsCount: 6,
      newsSkipTag: 'Student chapter',
    },
    pi: {
      name: 'Prof. Md. Kamruzzaman',
      fullName: 'Prof. Md. Kamruzzaman, Ph.D.',
      photo: 'images/portrait.jpg',
      email: 'mkamruzzamandu81@gmail.com',
      cv: 'CV-%20Dr.%20Kamruzzaman(2).pdf',
      website: '',
      positions: [
        { title: 'Chairman', place: 'Department of Applied Chemistry and Chemical Engineering (ACCE), GSTU', highlight: true },
        { title: 'Professor', place: 'Applied Chemistry and Chemical Engineering, Gopalganj Science and Technology University', highlight: false },
        { title: 'Faculty Advisor', place: 'ACS Student Chapter and AIChE Student Chapter, GSTU', highlight: false },
      ],
      fields: 'Analytical chemistry · Functional nanomaterials · Biopolymer nanocomposites · Luminescence and microfluidic sensing',
      photoCaption: 'Principal Investigator, AFMN Lab',
      photoCaption2: 'Ph.D., Kyungpook National University',
      shortBio:
        'Materials chemist and analytical chemist at Gopalganj Science and Technology University. Ph.D. in Analytical Chemistry, Kyungpook National University (2013). He is the Principal Investigator of the AFMN Lab.',
      cardNote: 'Faculty Advisor, ACS and AIChE Student Chapters, GSTU',
      cardBio: 'Ph.D. in Analytical Chemistry, Kyungpook National University (2013). Principal Investigator of the Advanced Functional Materials and Nanotechnology Laboratory at GSTU.',
      lede: 'Md. Kamruzzaman is Professor of Applied Chemistry and Chemical Engineering at Gopalganj Science and Technology University (GSTU), Bangladesh, and Chairman of the department.',
      biography: [
        'Born in Chapai Nawabganj, Bangladesh, he received his B.Sc. (Honours) in 2002 and M.Sc. in 2003 in Applied Chemistry and Chemical Technology from the University of Dhaka, both in the first class. He then joined the Environmental Microbiology Laboratory of icddr,b as a research assistant, working on projects funded by Dartmouth College, the World Bank and UNICEF.',
        'In 2010 he moved to the Spectroanalytical Chemistry Laboratory at Kyungpook National University, Daegu, Republic of Korea, where he received his Ph.D. in Analytical Chemistry in February 2013. His doctoral work introduced a series of nanoparticle-enhanced lanthanide luminescence and microfluidic chemiluminescence methods, published in <em>Food Chemistry</em>, <em>Sensors and Actuators B</em>, <em>Microchimica Acta</em>, <em>Biomedical Microdevices</em> and the <em>Journal of Luminescence</em>.',
        'After teaching at Daffodil International University and American International University–Bangladesh, he joined GSTU (then Bangabandhu Sheikh Mujibur Rahman Science and Technology University) in April 2018. He was promoted to Associate Professor in November 2021 and to Professor on 1 July 2026. At GSTU he is Principal Investigator of the Advanced Functional Materials and Nanotechnology (AFMN) Laboratory, whose work on MXene–biopolymer nanocomposites has appeared in <em>ACS Applied Engineering Materials</em>, <em>RSC Sustainability</em>, <em>Packaging Technology and Science</em> and <em>Materials Chemistry and Physics</em>.',
      ].join('\n\n'),
      appointments: [
        { period: '2026 –', title: 'Professor', detail: 'Applied Chemistry and Chemical Engineering, Gopalganj Science and Technology University. Chairman of the department.' },
        { period: '2021 – 2026', title: 'Associate Professor', detail: 'Applied Chemistry and Chemical Engineering, GSTU (formerly BSMRSTU)' },
        { period: '2018 – 2021', title: 'Assistant Professor', detail: 'Applied Chemistry and Chemical Engineering, BSMRSTU, Gopalganj' },
        { period: '2016 – 2018', title: 'Assistant Professor', detail: 'Department of Chemistry, American International University–Bangladesh' },
        { period: '2013 – 2016', title: 'Assistant Professor', detail: 'Department of Textile Engineering, Daffodil International University' },
        { period: '2010 – 2013', title: 'Doctoral Researcher', detail: 'Spectroanalytical Chemistry Laboratory, Kyungpook National University, Korea' },
        {
          period: '2006 – 2009',
          title: 'Research Assistant',
          detail:
            'Environmental Microbiology Laboratory, icddr,b, Dhaka. Projects: genomic assessment of phenotypic plasticity in an aquatic bacterium (Dartmouth College); handwashing behaviour in Bangladesh (World Bank); Health Impact Study (UNICEF).',
        },
      ],
      education: [
        { period: '2013', title: 'Ph.D., Analytical Chemistry', detail: 'Department of Chemistry, Kyungpook National University, Daegu, Republic of Korea' },
        { period: '2003', title: 'M.Sc., Applied Chemistry and Chemical Technology', detail: 'University of Dhaka · First class' },
        { period: '2002', title: 'B.Sc. (Honours), Applied Chemistry and Chemical Technology', detail: 'University of Dhaka · First class' },
      ],
      interests: [
        'MXene and graphitic carbon nitride nanocomposites for UV and high-energy blue light shielding',
        'Biodegradable active packaging and biopolymer biomaterials',
        'Nanomaterial-based fluorescence sensors and lanthanide-sensitised spectrofluorimetry',
        'Microfluidic and flow-injection chemiluminescence analysis',
        'Electrochemical sensors and biosensors',
        'Adsorbents for dye and heavy-metal removal from water',
      ].join('\n'),
      honours: [],
      service:
        'He chairs the Department of Applied Chemistry and Chemical Engineering at GSTU, teaches Inorganic Chemistry, Chemical Technology, Pharmaceutical Chemistry and Technology, and Textile Engineering, and supervises B.Sc. and M.Sc. thesis research. He is Faculty Advisor of both the ACS and AIChE student chapters at GSTU. See [Teaching](teaching.html).',
      languages: 'English, Bengali, Korean (elementary).',
      outputNote: 'conference presentations in Germany and Korea; chapters with Elsevier, the Royal Society of Chemistry and Taylor & Francis',
      chaptersIntro: 'Prof. Kamruzzaman is Faculty Advisor of two professional student chapters at Gopalganj Science and Technology University.',
      chapters: [
        {
          title: 'American Chemical Society (ACS) Student Chapter',
          text:
            'Founding Faculty Advisor of the [American Chemical Society Student Chapter, GSTU](https://acs-gstu.web.app), established in 2024 together with Co-Advisor S. M. Fazle Rabbi. The chapter runs outreach, workshops, career events and sustainability campaigns for students across the university, and has been recognised by the American Chemical Society.',
          links: [
            { label: 'Chapter website', url: 'https://acs-gstu.web.app' },
            { label: 'Facebook', url: 'https://www.facebook.com/acs.gstu/' },
          ],
          awards: [
            { period: '2025–2026', title: 'Outstanding Student Communities Award', detail: 'American Chemical Society. The highest level of ACS recognition for a student chapter.' },
            { period: '2024', title: 'Commendable Student Communities Award', detail: "American Chemical Society, in the chapter's first year." },
            { period: '2024', title: 'Chapter founded', detail: 'Established at GSTU (then BSMRSTU) with Prof. Kamruzzaman as founding Faculty Advisor.' },
          ],
          profileText:
            'Prof. Kamruzzaman is the founding Faculty Advisor of the [American Chemical Society Student Chapter, GSTU](https://acs-gstu.web.app), established in 2024 together with Co-Advisor S. M. Fazle Rabbi. The chapter runs outreach, workshops, career events and sustainability campaigns for students across the university. Under his advisorship it has organised outreach webinars, public sustainability campaigns and career events, and has been recognised by the American Chemical Society.',
          style: '',
        },
        {
          title: 'American Institute of Chemical Engineers (AIChE) Student Chapter',
          text: 'Faculty Advisor of the AIChE Student Chapter at GSTU, which connects chemical engineering students with the professional community through technical events, competitions and career development.',
          links: [],
          profileText: 'He also serves as Faculty Advisor of the American Institute of Chemical Engineers (AIChE) Student Chapter at GSTU, which connects chemical engineering students with the professional community through technical events, competitions and career development.',
          awards: [{ period: 'Current', title: 'Faculty Advisor, AIChE Student Chapter', detail: 'American Institute of Chemical Engineers student chapter, Gopalganj Science and Technology University.' }],
          style: 'aiche',
        },
      ],
    },
    research: {
      pageIntro: 'Functional nanomaterials, from nanosheet synthesis to films, sensors and adsorbents that work outside the laboratory.',
      lede: 'We make functional nanomaterials and use them to shield, preserve, clean and measure. The areas below are listed roughly in order of current activity.',
      areas: [
        {
          id: 'uv',
          title: 'UV and blue-light shielding films',
          summary: 'Transparent MXene and g-C<sub>3</sub>N<sub>4</sub> films in chitosan, alginate and PMMA that absorb UV and high-energy blue light.',
          image: 'images/ga/c3n4-pmma-md.jpg',
          imageAlt: 'Graphical abstract: fabrication of g-C₃N₄/PMMA films and their UV and high-energy blue light shielding.',
          caption:
            'Graphical abstract: fabrication of g-C₃N₄/PMMA films and their UV and high-energy blue light shielding. From Munshi et al., <em>Materials Chemistry and Physics</em> 359 (2026), [doi](https://doi.org/10.1016/j.matchemphys.2026.132492).',
          body:
            'Ultraviolet light and short-wavelength visible light (roughly 400–450 nm, often called high-energy blue light) degrade packaged food, plastics and pigments, and damage skin and eyes. Commercial UV absorbers are mostly small organic molecules that leach out or yellow over time.\n\nWe disperse delaminated Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> MXene and graphitic carbon nitride nanosheets in chitosan, alginate and PMMA. At low loadings the nanosheets absorb strongly in the UV and blue while the film remains transparent and flexible. We study how dispersion, film thickness and crosslinking affect optical, mechanical and barrier properties.',
          papers: 'Munshi et al., <em>RSC Sustainability</em> 3, 3036 (2025)\nMunshi et al., <em>ACS Applied Engineering Materials</em> 3, 3531 (2025)\nMunshi et al., <em>Materials Chemistry and Physics</em> 359 (2026)',
        },
        {
          id: 'packaging',
          title: 'Biodegradable packaging and biomaterials',
          summary: 'Antibacterial, antioxidant alginate/MXene packaging films, keratin bioplastics and wound patches.',
          image: 'images/ga/alginate-mxene-packaging-md.jpg',
          imageAlt: 'Graphical abstract: Ca²⁺-crosslinked alginate/MXene films with antibacterial, UV/HEBL-shielding and radical-scavenging activity, and soil biodegradation.',
          caption:
            'Graphical abstract: Ca²⁺-crosslinked alginate/MXene films with antibacterial, UV/HEBL-shielding and radical-scavenging activity, and soil biodegradation. From Munshi et al., <em>Carbohydrate Polymer Technologies and Applications</em> (2026), [doi](https://doi.org/10.1016/j.carpta.2026.101229).',
          body:
            'The same films can do more than block light. Ca<sup>2+</sup>-crosslinked alginate/MXene and chitosan/MXene films show antibacterial and antioxidant activity, and we are testing them as active food packaging. Related projects include PVA bioplastics reinforced with keratin recovered from duck feathers, alginate–cellulose patches for wound care, and chitosan finishes for antibacterial textiles.',
          papers: 'Munshi et al., <em>Packaging Technology and Science</em> 39, 697 (2026)\nMunshi et al., <em>Carbohydrate Polymer Technologies and Applications</em> (2026)\nHabib et al., <em>Results in Materials</em> 27, 100735 (2025)',
        },
        {
          id: 'sensing',
          title: 'Nanoparticle-enhanced luminescence sensing',
          shortTitle: 'Luminescence sensing',
          summary: 'Lanthanide and nanoparticle-enhanced fluorescence methods for drugs, bilirubin and proteins in serum.',
          image: 'images/ga/bilirubin-luminescence-md.jpg',
          imageAlt: 'Graphical abstract: quenching of yttrium–norfloxacin fluorescence by bilirubin, used to quantify bilirubin in serum.',
          caption:
            'Graphical abstract: quenching of yttrium–norfloxacin fluorescence by bilirubin, used to quantify bilirubin in serum. From Kamruzzaman et al., <em>Journal of Luminescence</em> 132, 3053 (2012), [doi](https://doi.org/10.1016/j.jlumin.2012.06.013).',
          body:
            'Europium(III) and terbium(III) complexes give narrow, long-lived emission when an organic ligand transfers absorbed energy to the metal ion. Many drugs, including fluoroquinolone antibiotics and catecholamines, can act as that ligand, so their concentration can be read from the lanthanide emission. Placing silver or gold nanoparticles near the complex increases the signal through plasmonic coupling.\n\nUsing this approach we have determined antibiotics, catecholamines, vitamins, bilirubin, ATP and proteins in serum, urine, food and pharmaceutical samples with ordinary spectrofluorimeters.',
          papers:
            'Kamruzzaman et al., <em>Microchimica Acta</em> 174, 353 (2011)\nAlam, Kamruzzaman et al., <em>Microchimica Acta</em> 176, 153 (2012)\nKamruzzaman et al., <em>Journal of Luminescence</em> 132, 3053 (2012)\nKamruzzaman, Munshi, Mia, <em>Journal of Analytical Chemistry</em> 81, 1017 (2026)',
        },
        {
          id: 'microfluidics',
          title: 'Microfluidic chemiluminescence analysis',
          shortTitle: 'Microfluidic chemiluminescence',
          summary: 'Chip-based, nanoparticle-catalysed chemiluminescence for vitamins and amino acids in food and medicines.',
          image: 'images/ga/microfluidic-chip.jpg',
          natural: true,
          imageAlt: 'Microfluidic chemiluminescence set-up: syringe pumps, chip reactor and PMT detection.',
          caption:
            'Microfluidic chemiluminescence set-up: syringe pumps, chip reactor and PMT detection. From Kamruzzaman et al., <em>Food Chemistry</em> 135, 57 (2012), Fig. 1, [doi](https://doi.org/10.1016/j.foodchem.2012.04.062).',
          body:
            'In microfluidic chips, sample and reagent streams meet in channels less than a millimetre wide and the light from a chemiluminescent reaction is measured as they mix. We built chips in which platinum or gold nanoparticles catalyse the luminol reaction, and used them to determine vitamin B<sub>1</sub>, vitamin B<sub>12</sub>, L-phenylalanine and total sugars in food and pharmaceutical samples using microlitres of reagent.',
          papers: 'Kamruzzaman et al., <em>Food Chemistry</em> 135, 57 (2012)\nKamruzzaman et al., <em>Sensors and Actuators B</em> 185, 301 (2013)\nKamruzzaman et al., <em>Biomedical Microdevices</em> 15, 195 (2013)',
        },
        {
          id: 'water',
          title: 'Water treatment',
          summary: 'Graphene, lignin and alginate adsorbents for dyes, Cr(VI) and lead in textile effluent.',
          image: 'images/ga/graphene-lead-md.jpg',
          imageAlt: 'Graphical abstract: microwave-exfoliated graphene prepared from graphite for Pb²⁺ adsorption.',
          caption:
            'Graphical abstract: microwave-exfoliated graphene prepared from graphite for Pb²⁺ adsorption. From Billah et al., <em>Surfaces and Interfaces</em> 74, 107655 (2025), [doi](https://doi.org/10.1016/j.surfin.2025.107655).',
          body:
            'Textile effluent is one of the main sources of water pollution in Bangladesh. We prepare adsorbents from graphene, lignin and alginate, including graphene-functionalised aminated lignin and magnetic alginate beads, and study how they take up Congo red, Cr(VI) and Pb<sup>2+</sup> and how well they can be regenerated.',
          papers: 'Billah et al., <em>RSC Advances</em> 16, 14378 (2026)\nBillah et al., <em>Surfaces and Interfaces</em> 74, 107655 (2025)',
        },
      ],
      projects: [
        'Graphitic carbon nitride / PMMA transparent films for UV and blue-light shielding',
        'MXene-dispersed alginate films for UV and blue-light shielding',
        'Ionically crosslinked, nanomaterial-loaded alginate–cellulose films for wound patching',
        'Graphene oxide–alginate beads for dye removal from coloured water',
      ].join('\n'),
      funding: [],
      collaborators: [],
    },
    instruments: {
      intro: 'Instruments and facilities used for synthesis, film fabrication and analysis in the Advanced Functional Materials and Nanotechnology (AFMN) Lab.',
      items: [
        ['Optical', 'UV–Vis spectrophotometer', 'Absorbance and transmittance of films and dispersions; UV-A, UV-B and blue-light shielding efficiency'],
        ['Optical', 'Spectrofluorimeter', 'Lanthanide luminescence and fluorescence-probe assays'],
        ['Spectroscopy', 'FTIR spectrometer', 'Functional groups and polymer–nanosheet interactions'],
        ['Separation', 'HPLC system', 'Quantification of pharmaceuticals and contaminants'],
        ['Analysis', 'Flow-injection chemiluminescence set-up', 'Syringe pumps, microfluidic reactor and PMT detection'],
        ['Synthesis', 'Probe and bath sonicators', 'MXene delamination and nanosheet dispersion'],
        ['Synthesis', 'Centrifuge', 'Separation and washing of nanomaterials'],
        ['Synthesis', 'Magnetic stirrers and hot plates', 'Polymer dissolution, blending and nanoparticle synthesis'],
        ['Thermal', 'Vacuum oven, drying oven and muffle furnace', 'Film drying, g-C<sub>3</sub>N<sub>4</sub> synthesis and graphene exfoliation'],
        ['Processing', 'Microwave oven and ball mill', 'Microwave exfoliation and milling of graphite'],
        ['General', 'Analytical balance, pH meter, fume hood', 'Routine preparation and handling'],
      ].map(([category, name, detail]) => ({ category, name, detail, model: '', image: '', status: 'available' })),
    },
    team: {
      pageIntro: 'Researchers in the Advanced Functional Materials and Nanotechnology (AFMN) Laboratory. Principal Investigator: Prof. Md. Kamruzzaman.',
      members: TEAM_.map((m) => ({
        name: m.name,
        group: m.role === 'alumni' ? 'alumni' : m.role === 'collab' ? 'collab' : 'current',
        position: m.title || 'Research Member',
        topic: m.topic || '',
        photo: m.photo || '',
        email: '',
        website: m.website || '',
        period: '',
        now: '',
        links: Object.entries(m.links || {}).map(([k, url]) => ({ label: LINK_NAMES[k] || k, url })),
      })),
      joinText:
        'The group takes B.Sc. thesis and M.Sc. students each year. Applicants should have a background in chemistry, chemical engineering or materials science and an interest in nanomaterials, polymer films or analytical methods.\n\nPlease write to Prof. Kamruzzaman with a CV, an academic transcript and a short note on the problems you would like to work on.',
    },
    publications: {
      pageIntro:
        'Publications of the Principal Investigator, Prof. Md. Kamruzzaman, and AFMN Lab members: journal articles, reviews, book chapters and conference presentations since 2010. Reprints on request; the live record is on [Google Scholar](https://scholar.google.com/citations?user=q-C5scUAAAAJ&hl=en).',
      items: basePubs,
      seen: basePubs.map(pubKey),
    },
    news: {
      pageIntro: 'News from the AFMN Lab and its Principal Investigator, Prof. Md. Kamruzzaman.',
      items: baseNews,
      seen: baseNews.map(newsKey),
    },
    openings: {
      pageIntro: 'Research positions, thesis projects and other opportunities in the AFMN Lab.',
      intro:
        'The group takes B.Sc. thesis and M.Sc. students each year. Applicants should have a background in chemistry, chemical engineering or materials science and an interest in nanomaterials, polymer films or analytical methods.',
      positions: [],
      applyForm: '',
      applyLink: '',
      applyLabel: 'Apply online',
      howToApply: 'Please write to Prof. Kamruzzaman with a CV, an academic transcript and a short note on the problems you would like to work on.',
    },
    gallery: {
      pageIntro: 'Life in the AFMN Lab: experiments, events, conferences and celebrations.',
      photos: [],
    },
    teaching: {
      pageIntro: 'Courses and thesis supervision by the Principal Investigator, Prof. Md. Kamruzzaman, in the Department of Applied Chemistry and Chemical Engineering.',
      lede: 'Prof. Kamruzzaman teaches in the Department of Applied Chemistry and Chemical Engineering at GSTU and supervises B.Sc. and M.Sc. thesis research.',
      courses: COURSES_.map(([code, title, level, term, mats = []]) => ({ code: code || '', title, level: level || '', term: term || '', materials: mats.map(([label, url]) => ({ label, url })) })),
      supervision:
        'Thesis students work on the programmes described on the [research](research.html) page. Recent student-led papers have appeared in <em>RSC Sustainability</em>, <em>ACS Applied Engineering Materials</em>, <em>Materials Chemistry and Physics</em> and <em>Results in Materials</em>.',
      previous: [
        { period: '2016 – 2018', title: 'American International University–Bangladesh', detail: 'Department of Chemistry' },
        { period: '2013 – 2016', title: 'Daffodil International University', detail: 'Department of Textile Engineering' },
      ],
    },
  };

  const SECTIONS = Object.keys(DEFAULTS);

  /**
   * The content to show: defaults, replaced section by section by what was published, with new Scholar
   * papers / news (from data.js) that the dashboard has not seen yet, and current citation counts.
   */
  function resolve(published = {}) {
    const out = {};
    for (const id of SECTIONS) out[id] = published[id] && typeof published[id] === 'object' ? { ...DEFAULTS[id], ...published[id] } : DEFAULTS[id];
    out.publications = withScholar(out.publications);
    out.news = withScholarNews(out.news);
    return out;
  }
  function withScholar(section) {
    const seen = new Set(section.seen || []);
    const byKey = new Map(basePubs.map((p) => [pubKey(p), p]));
    const items = (section.items || []).map((p) => {
      const base = byKey.get(pubKey(p));
      return base && base.cites > (p.cites || 0) ? { ...p, cites: base.cites } : p;
    });
    const have = new Set(items.map(pubKey));
    const fresh = basePubs.filter((p) => !seen.has(pubKey(p)) && !have.has(pubKey(p)));
    return { ...section, items: [...fresh, ...items], fresh };
  }
  function withScholarNews(section) {
    const seen = new Set(section.seen || []);
    const have = new Set((section.items || []).map(newsKey));
    const fresh = baseNews.filter((n) => !seen.has(newsKey(n)) && !have.has(newsKey(n)));
    return { ...section, items: [...fresh, ...(section.items || [])], fresh };
  }

  /** Scholar items in data.js the dashboard has not seen yet (for the "New from Google Scholar" box). */
  const unseenPublications = (section) => withScholar(section).fresh;
  const unseenNews = (section) => withScholarNews(section).fresh;

  g.LAB = { DEFAULTS, SECTIONS, resolve, unseenPublications, unseenNews, pubKey, newsKey, inline, paras, lines, esc, stripTags, LINK_NAMES, basePubs, baseNews };
})();
