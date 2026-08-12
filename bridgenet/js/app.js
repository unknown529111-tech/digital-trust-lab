/* BridgeNet — progressive enhancement
   - No-JS experience: full English content works (details/summary native).
   - With JS: search, topic filters, themes, font scale, text-only, EN/AR switch,
     all persisted in localStorage (bridgenet_prefs_v1), announced via aria-live.
*/
"use strict";

(function () {
  var STORE = "bridgenet_prefs_v1";
  var prefs = { theme: null, fontScale: "md", textOnly: false, lang: "en" };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(STORE) || "{}")); } catch (e) {}

  var docEl = document.documentElement;
  var live = document.getElementById("live-announce");

  /* Capture pristine English topics HTML once, before any re-render. */
  var topicsSection = document.getElementById("topics");
  var enTopicsHtml = topicsSection ? topicsSection.innerHTML : "";
  var aboutBody = document.getElementById("about-body");
  var enAboutHtml = aboutBody ? aboutBody.innerHTML : "";

  function announce(msg) {
    if (live && msg) {
      live.textContent = "";
      // Two-frame gap lets screen readers register repeated identical messages.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { live.textContent = msg; });
      });
    }
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch (e) {}
  }

  /* ---------- Arabic content (default language is English, kept in the HTML) ---------- */

  var I18N = {
    en: {
      skip: "Skip to main content",
      pageTitle: "Knowledge for everyone",
      lede: "Practical guides to getting online, staying safe, and using technology with confidence. Built for low-bandwidth connections, screen readers, keyboards, and any device.",
      navTopics: "Topics",
      navServices: "Local services",
      navAbout: "About",
      searchPlaceholder: "Search topics…",
      searchClear: "Clear search",
      filterLegend: "Filter by topic",
      fAll: "All",
      fOnline: "Getting online",
      fSafety: "Safety & privacy",
      fAccess: "Accessibility",
      fAi: "AI for everyone",
      topicsTitle: "Learning topics",
      servicesTitle: "Local services (sample directory)",
      aboutTitle: "About BridgeNet",
      aboutBody: "BridgeNet is a demonstration portal for digital inclusion. It weighs under 60\u00A0KB, works offline, supports Arabic and English, passes automated WCAG\u00A02.2\u00A0AA audits, and runs on a 2G connection. ",
      aboutLink: "Read the technical documentation",
      offline: "You are offline. Showing saved content — connectivity will return automatically.",
      footer: "\u00A9 2026 BridgeNet — made for digital inclusion. All content is educational sample data.",
      backTop: "Back to top",
      a11yStatement: "Accessibility statement",
      fontSmall: "Smaller text",
      fontMd: "Default text size",
      fontLg: "Larger text",
      contrast: "High contrast",
      textOnly: "Text only",
      langBtn: "العربية",
      langLabel: "Switch language to Arabic",
      toolbarLabel: "Appearance and language settings",
      textSize: "Text size",
      displayOptions: "Display options",
      resultsFound: function (n) { return n === 1 ? "1 topic shown" : n + " topics shown"; },
      noResults: "No topics match your search. Try a different word or clear the filter."
    },
    ar: {
      skip: "تخطَّ إلى المحتوى الرئيسي",
      pageTitle: "المعرفة للجميع",
      lede: "أدلة عملية للاتصال بالإنترنت، والبقاء آمنين، واستخدام التكنولوجيا بثقة. صُمم ليعمل على الاتصالات البطيئة، ومع قارئات الشاشة، ولوحة المفاتيح، وعلى أي جهاز.",
      navTopics: "المواضيع",
      navServices: "خدمات محلية",
      navAbout: "من نحن",
      searchPlaceholder: "ابحث في المواضيع…",
      searchClear: "مسح البحث",
      filterLegend: "تصفية حسب الموضوع",
      fAll: "الكل",
      fOnline: "الاتصال بالإنترنت",
      fSafety: "الأمان والخصوصية",
      fAccess: "إمكانية الوصول",
      fAi: "الذكاء الاصطناعي للجميع",
      topicsTitle: "مواضيع تعليمية",
      servicesTitle: "خدمات محلية (دليل تجريبي)",
      aboutTitle: "عن بريدجنِت",
      aboutBody: "بريدجنِت بوابة تجريبية للشمول الرقمي. حجمها أقل من 60 كيلوبايت، تعمل دون اتصال، تدعم العربية والإنجليزية، وتجتاز فحوصات WCAG 2.2 AA الآلية، وتعمل على اتصال 2G. ",
      aboutLink: "اقرأ التوثيق الفني",
      offline: "أنت غير متصل. يتم عرض المحتوى المحفوظ — ستعود الخدمة تلقائيًا.",
      footer: "© 2026 بريدجنِت — صُنع من أجل الشمول الرقمي. كل المحتوى بيانات تعليمية توضيحية.",
      backTop: "العودة إلى الأعلى",
      a11yStatement: "بيان إمكانية الوصول",
      fontSmall: "تصغير الخط",
      fontMd: "حجم الخط الافتراضي",
      fontLg: "تكبير الخط",
      contrast: "تباين عالٍ",
      textOnly: "نص فقط",
      langBtn: "English",
      langLabel: "Switch language to English",
      resultsFound: function (n) { return n + " مواضيع متاحة"; },
      noResults: "لا توجد مواضيع تطابق بحثك. جرّب كلمة أخرى أو امسح التصفية."
    }
  };

  var AR_CONTENT = [
    {
      topic: "get-online",
      title: "1. الفجوة الرقمية: ما هي ولماذا تهمنا",
      body: "الفجوة الرقمية هي الفارق بين من يستطيع استخدام الإنترنت والتكنولوجيا بثقة، ومن لا يستطيع — بسبب التكلفة أو التغطية أو اللغة أو الإعاقة أو المهارات. سدّ هذه الفجوة يعني التصميم للجميع من البداية: اتصالات بطيئة، أجهزة قديمة، قارئات شاشة، ولغات متعددة.",
      extraTitle: "لماذا يهمك هذا",
      extra: "يقارب نصف سكان العالم ما زالوا غير متصلين أو متصلين بشكل ضعيف. عندما تنتقل الخدمات إلى الإنترنت — الصحة والمدرسة والحكومة和工作 — يبقى من لا يملكون وصولًا موثوقًا خلف الجميع. الخيارات الصغيرة (صفحات خفيفة، عمل دون اتصال، لغة بسيطة) هي ما يجعل الشمول حقيقيًا."
    },
    {
      topic: "get-online",
      title: "2. الاتصال بالإنترنت بأقل تكلفة",
      body: "لا تحتاج أحدث هاتف ولا أسرع باقة. تعلّم عن باقات البيانات منخفضة التكلفة، ونقاط الواي فاي المجتمعية، وأجهزة المكتبات العامة، والتطبيقات التي تعمل جيدًا على الاتصالات الضعيفة. نصيحة: فعّل «وضع توفير البيانات» في متصفحك واستخدم النسخ النصية أو «الخفيفة» من المواقع الشهيرة."
    },
    {
      topic: "safety",
      title: "3. أساسيات الأمان والخصوصية",
      body: "خط دفاعك الأول هو العادات: استخدم كلمة مرور طويلة وفريدة لكل حساب؛ وفعّل التحقق بخطوتين؛ وحدّث هاتفك وتطبيقاتك؛ وتعامل مع الروابط والرسائل غير المتوقعة بالحذر. إذا طلب منك أحدهم المال أو كلمات المرور على عجل، فغالبًا هو احتيال.",
      extraTitle: "ثلاث خطوات سريعة",
      extraList: [
        "فعّل التحقق بخطوتين للبريد الإلكتروني والحسابات البنكية.",
        "استخدم مدير كلمات مرور بدلًا من تكرار كلمة المرور نفسها.",
        "راجع إعدادات الخصوصية في تطبيقات التواصل مرة كل سنة."
      ]
    },
    {
      topic: "accessibility",
      title: "4. ميزات إمكانية الوصول الموجودة أصلًا في هاتفك",
      body: "معظم الهواتف تتضمن أدوات مجانية: نص أكبر، عرض عالي التباين، قارئ شاشة (TalkBack / VoiceOver)، كتابة صوتية، وتكبير. تجدها عادة في: الإعدادات ← إمكانية الوصول. هذه الميزات ليست «إضافات» — بل هي كيف تصبح التكنولوجيا قابلة للاستخدام لمن يعانون ضعف الإبصار، أو محدودية الحركة، أو يفضلون الاستماع على القراءة."
    },
    {
      topic: "get-online",
      title: "5. استخدام الخدمات الحكومية عبر الإنترنت",
      body: "بوابات الحكومة تتعامل مع المزايا والبطاقات الشخصية والسجلات الصحية والضرائب. قبل البدء، جهّز مستنداتك، واستخدم موقعًا رسميًا، ولا تشارك كلمة المرور أو رمز التحقق مع أي شخص يتصل بك أو يراسلك. وإذا كان الموقع صعب الاستخدام، اطلب المساعدة من شخص موثوق أو من خط المساعدة — فالخدمات الجيدة توفر دعمًا بشريًا أيضًا."
    },
    {
      topic: "ai",
      title: "6. الذكاء الاصطناعي للجميع — وأين يجب الحذر",
      body: "يمكن لأدوات الذكاء الاصطناعي أن تترجم وتلخّص وتضيف ترجمات للفيديو وتقرأ النصوص بصوت عالٍ — مكاسب حقيقية للشمول. لكنها قد تخطئ أيضًا، وهي تُدرَّب على بيانات تعكس تحيزات قائمة. قاعدة عامة: استخدم الذكاء الاصطناعي للصياغة والفهم، وتحقق من الحقائق بنفسك، ولا تضع أسرارك أبدًا في هذه الأدوات. على الذكاء الاصطناعي أن يطلب قبل أن يتصرف، وعليك دائمًا أن تستطيع أن تقول لا.",
      extraTitle: "قائمة تحقق بسيطة عن الذكاء الاصطناعي",
      extraList: [
        "افترض أن الذكاء الاصطناعي قد يخطئ؛ تحقق من الأمور المهمة.",
        "لا تشارك كلمات المرور أو الأرقام الشخصية أو بيانات البنك مع روبوتات المحادثة.",
        "أبقِ الإنسان في الحلقة للقرارات التي تؤثر على حياتك."
      ]
    }
  ];

  var AR_SERVICES = [
    ["دروس كمبيوتر مجانية للمجتمع", "جلسات أسبوعية مجانية لجميع المستويات. قاعة البلدية، غرفة 12."],
    ["برنامج الأجهزة بأسعار مناسبة", "هواتف وحواسيب مجدَّدة معتمدة بأسعار منخفضة."],
    ["مكتب مساعدة الترجمة الهاتفية", "دعم بـ12 لغة للخدمات الحكومية."],
    ["ركن البحث عن عمل", "مساعدة في بناء السيرة الذاتية والتقديم عبر الإنترنت. المكتبة، الطابق الثاني."]
  ];

  function articleHtml(a) {
    var extra = "";
    if (a.extraTitle) {
      extra = "<details><summary>" + a.extraTitle + "</summary>";
      if (a.extraList) {
        extra += "<ul>" + a.extraList.map(function (li) { return "<li>" + li + "</li>"; }).join("") + "</ul>";
      } else {
        extra += "<p>" + a.extra + "</p>";
      }
      extra += "</details>";
    }
    return '<article class="card" data-topic="' + a.topic + '">' +
      "<h3>" + a.title + "</h3><p>" + a.body + "</p>" + extra + "</article>";
  }

  function setLang(lang) {
    if (lang !== "ar" && lang !== "en") return;
    prefs.lang = lang;
    var t = lang === "ar" ? I18N.ar : I18N.en;
    docEl.setAttribute("lang", lang);
    docEl.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    docEl.setAttribute("data-lang", lang);

    function set(id, val) { var el = document.getElementById(id); if (el && val !== undefined) el.textContent = val; }
    set("page-title", t.pageTitle);
    set("page-lede", t.lede);
    set("topics-title", t.topicsTitle);
    set("services-title", t.servicesTitle);
    set("about-title", t.aboutTitle);
    set("offline-note", t.offline);

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (t[key] !== undefined) el.textContent = t[key];
    });

    var aboutBodyEl = document.getElementById("about-body");
    if (aboutBodyEl) {
      if (lang === "ar") {
        aboutBodyEl.innerHTML = t.aboutBody +
          '<a id="about-link" href="https://github.com/unknown529111-tech/digital-trust-lab/tree/main/bridgenet">' +
          t.aboutLink + "</a> for the full accessibility statement.";
      } else if (enAboutHtml) {
        aboutBodyEl.innerHTML = enAboutHtml;
      }
    }

    var searchInput = document.getElementById("search-input");
    if (searchInput) searchInput.placeholder = t.searchPlaceholder;
    var clearBtn = document.getElementById("search-clear");
    if (clearBtn) clearBtn.textContent = t.searchClear;

    var skip = document.querySelector(".skip-link");
    if (skip) skip.textContent = t.skip;

    var langBtn = document.getElementById("lang-toggle");
    if (langBtn) {
      langBtn.textContent = t.langBtn;
      langBtn.setAttribute("aria-label", t.langLabel);
      langBtn.setAttribute("lang", lang === "ar" ? "en" : "ar");
    }

    /* Articles: English lives in the static HTML (no-JS default); Arabic is rendered from dict. */
    if (lang === "ar") {
      topicsSection.innerHTML = AR_CONTENT.map(articleHtml).join("");
    } else if (enTopicsHtml) {
      topicsSection.innerHTML = enTopicsHtml;
    }

    /* Services */
    var servicesUl = document.getElementById("services-list");
    if (servicesUl) {
      if (lang === "ar") {
        servicesUl.innerHTML = AR_SERVICES.map(function (s) {
          return "<li><a href=\"#services\"><strong>" + s[0] + "</strong></a><br />" + s[1] + "</li>";
        }).join("");
      } else {
        servicesUl.innerHTML =
          '<li><a href="#services"><strong>Community computer classes</strong></a><br />Free weekly sessions, all levels. City Hall, Room 12.</li>' +
          '<li><a href="#services"><strong>Affordable devices program</strong></a><br />Certified refurbished phones and laptops, low cost.</li>' +
          '<li><a href="#services"><strong>Phone interpretation helpdesk</strong></a><br />Support in 12 languages for government services.</li>' +
          '<li><a href="#services"><strong>Job search corner</strong></a><br />Help building a resume and applying online. Library, floor 2.</li>';
      }
    }

    applyFilters(true);
    save();
  }

  /* ---------- Theme, font scale, text-only ---------- */

  var contrastBtn = document.getElementById("contrast-toggle");
  var textOnlyBtn = document.getElementById("textonly-toggle");

  contrastBtn.addEventListener("click", function () {
    prefs.theme = prefs.theme === "high-contrast" ? null : "high-contrast";
    if (prefs.theme) docEl.setAttribute("data-theme", "high-contrast");
    else docEl.removeAttribute("data-theme");
    contrastBtn.setAttribute("aria-pressed", prefs.theme ? "true" : "false");
    announce(prefs.theme ? "High contrast enabled" : "High contrast disabled");
    save();
  });

  textOnlyBtn.addEventListener("click", function () {
    prefs.textOnly = !prefs.textOnly;
    if (prefs.textOnly) docEl.setAttribute("data-text-only", "on");
    else docEl.removeAttribute("data-text-only");
    textOnlyBtn.setAttribute("aria-pressed", prefs.textOnly ? "true" : "false");
    announce(prefs.textOnly ? "Text only mode enabled" : "Text only mode disabled");
    save();
  });

  document.querySelectorAll("[data-font-action]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      prefs.fontScale = btn.getAttribute("data-font-action");
      docEl.setAttribute("data-font", prefs.fontScale);
      announce("Text size adjusted");
      save();
    });
  });

  document.getElementById("lang-toggle").addEventListener("click", function () {
    setLang(prefs.lang === "ar" ? "en" : "ar");
    if (prefs.lang === "ar") announce("Switched to Arabic");
    else announce("Switched to English");
  });

  /* ---------- Search + topic filters (combined, announced) ---------- */

  var searchInput = document.getElementById("search-input");
  var searchStatus = document.getElementById("search-status");
  var state = { topic: "all", query: "" };

  function applyFilters(silent) {
    var cards = Array.prototype.slice.call(document.querySelectorAll("article.card"));
    var shown = 0;
    cards.forEach(function (card) {
      var topic = card.getAttribute("data-topic") || "";
      var text = card.textContent.toLowerCase();
      var okTopic = state.topic === "all" || topic === state.topic;
      var okQuery = state.query === "" || text.indexOf(state.query) !== -1;
      var visible = okTopic && okQuery;
      if (visible) shown++;
      card.hidden = !visible;
    });
    document.querySelectorAll(".chip").forEach(function (c) {
      c.setAttribute("aria-pressed", c.getAttribute("data-topic") === state.topic ? "true" : "false");
    });
    var msg = shown === 0 ? (I18N[prefs.lang].noResults) : (I18N[prefs.lang].resultsFound(shown));
    if (searchStatus) searchStatus.textContent = msg;
    if (!silent) announce(msg);
  }

  searchInput.addEventListener("input", function () {
    state.query = searchInput.value.trim().toLowerCase();
    applyFilters(false);
  });

  document.getElementById("search-clear").addEventListener("click", function () {
    searchInput.value = "";
    state.query = "";
    applyFilters(false);
    searchInput.focus();
  });

  document.querySelectorAll(".chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      state.topic = chip.getAttribute("data-topic");
      applyFilters(false);
    });
  });

  /* ---------- Offline banner ---------- */

  var offlineNote = document.getElementById("offline-note");
  function syncOffline() {
    offlineNote.hidden = navigator.onLine !== false;
  }
  window.addEventListener("online", syncOffline);
  window.addEventListener("offline", syncOffline);
  syncOffline();

  /* ---------- Init ---------- */

  // Restore toolbar pressed states
  if (prefs.theme === "high-contrast") contrastBtn.setAttribute("aria-pressed", "true");
  if (prefs.textOnly) textOnlyBtn.setAttribute("aria-pressed", "true");

  if (prefs.lang === "ar") setLang("ar");
  else applyFilters(true);
})();