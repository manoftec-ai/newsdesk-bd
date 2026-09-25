const siteUrl = (
  import.meta.env.SITE_URL ||
  import.meta.env.PUBLIC_SITE_URL ||
  "https://jachaidesk.com"
).replace(/\/$/, "");

export const SITE = {
  name: "যাচাইডেস্ক",
  tagline: "বাংলাদেশের সবচেয়ে যাচাই-করা সংবাদ",
  description:
    "যাচাইডেস্ক — বাংলাদেশের একাধিক পত্রিকা থেকে একই ঘটনার খবর যাচাই করে একটিমাত্র মূল ও প্রমাণসহ সংবাদ হিসেবে প্রকাশ করে। প্রতিটি সংবাদের সাথে সূত্র ও প্রমাণ একসঙ্গে দেখা যায়।",
  url: siteUrl,
  locale: "bn-BD",
  language: "bn",
  repositoryUrl: "https://github.com/",
};

export const SEO = {
  googleSiteVerification: "",
  bingSiteVerification: "",
};

export const NAVIGATION = [
  { to: "/", label: "সর্বশেষ" },
  { to: "/category/national", label: "জাতীয়" },
  { to: "/category/politics", label: "রাজনীতি" },
  { to: "/category/economy", label: "অর্থনীতি" },
  { to: "/category/international", label: "আন্তর্জাতিক" },
  { to: "/category/sports", label: "ক্রীড়া" },
  { to: "/category/entertainment", label: "বিনোদন" },
  { to: "/category/tech", label: "প্রযুক্তি" },
];

export const MORE_NAVIGATION = [
  { to: "/category/opinion", label: "মতামত/বিশ্লেষণ" },
  { to: "/news", label: "সব খবর" },
  { to: "/tracked", label: "ট্র্যাক করা গল্প" },
  { to: "/ghotona", label: "ঘটনাপঞ্জি" },
  { to: "/category/history", label: "ইতিহাস" },
  { to: "/factcheck", label: "ফ্যাক্ট চেক" },
  { to: "/districts", label: "জেলার খবর" },
  { to: "/corrections", label: "সংশোধন নীতি" },
  { to: "/about", label: "আমাদের সম্পর্কে" },
  { to: "/contact", label: "যোগাযোগ" },
];

export const CONTACT = {
  email: "hello@jachaidesk.com",
  address: "যাচাইডেস্ক, ঢাকা-১২০৫, বাংলাদেশ",
  socialHandle: "@jachaidesk",
  socialUrl: "https://x.com/jachaidesk",
};

export const FORMS = {
  contact: {
    action: "",
    method: "post",
    enctype: "application/x-www-form-urlencoded",
  },
  newsletter: {
    action: "",
    method: "post",
    enctype: "application/x-www-form-urlencoded",
  },
};

export const SOCIAL_LINKS = [
  { href: CONTACT.socialUrl, label: `${SITE.name} X (টুইটার)`, icon: "twitter" },
  { href: "", label: `${SITE.name} ফেসবুক পেজ`, icon: "facebook" },
  { href: "", label: `${SITE.name} টেলিগ্রাম চ্যানেল`, icon: "send" },
  { href: SITE.repositoryUrl, label: `${SITE.name} GitHub`, icon: "github" },
];

export const authors = [
  {
    slug: "desk",
    name: "যাচাইডেস্ক ডেস্ক",
    shortName: "যাচাইডেস্ক",
    bio: "যাচাইডেস্কের স্বয়ংক্রিয় সংবাদ ডেস্ক — একাধিক পত্রিকা ও দাপ্তরিক সূত্র থেকে সংবাদ যাচাই করে প্রকাশ করা হয়।",
    longBio:
      "যাচাইডেস্ক ডেস্ক স্বয়ংক্রিয় পাইপলাইনের মাধ্যমে ১২টিরও বেশি বাংলাদেশি সংবাদমাধ্যম ও সরকারি-সংস্থার তথ্য সংগ্রহ করে, একই ঘটনার একাধিক প্রতিবেদন মিলিয়ে একটি নির্ভরযোগ্য, প্রমাণসহ সংবাদ তৈরি করে। প্রতিটি সংবাদের প্রতিটি তথ্য সূত্রেব্যবহারে ফিরে দেখা যায়।",
    avatar: "/avatars/desk.svg",
  },
];

const renderCategory = (slug, name, color) => ({ slug, name, color });

export const categories = [
  renderCategory("national", "জাতীয়", "#a8281f"),
  renderCategory("politics", "রাজনীতি", "#7b241c"),
  renderCategory("economy", "অর্থনীতি", "#0e6f5e"),
  renderCategory("international", "আন্তর্জাতিক", "#1a6293"),
  renderCategory("sports", "ক্রীড়া", "#16693b"),
  renderCategory("entertainment", "বিনোদন", "#6d3490"),
  renderCategory("tech", "প্রযুক্তি", "#0e6474"),
  renderCategory("opinion", "মতামত/বিশ্লেষণ", "#8a5a08"),
  renderCategory("latest", "সর্বশেষ", "#54616d"),
  renderCategory("factcheck", "ফ্যাক্ট চেক", "#5b21b6"),
  renderCategory("history", "ইতিহাস", "#a05a2c"),
];

export const districts = [
  { slug: "dhaka", name: "ঢাকা" },
  { slug: "chattogram", name: "চট্টগ্রাম" },
  { slug: "sylhet", name: "সিলেট" },
  { slug: "rajshahi", name: "রাজশাহী" },
  { slug: "khulna", name: "খুলনা" },
  { slug: "rangpur", name: "রংপুর" },
  { slug: "barishal", name: "বরিশাল" },
  { slug: "mymensingh", name: "ময়মনসিংহ" },
  { slug: "cumilla", name: "কুমিল্লা" },
  { slug: "narayanganj", name: "নারায়ণগঞ্জ" },
  { slug: "gaibandha", name: "গাইবান্ধা" },
  { slug: "dinajpur", name: "দিনাজপুর" },
  { slug: "bogura", name: "বগুড়া" },
  { slug: "jashore", name: "যশোর" },
  { slug: "tangail", name: "টাঙ্গাইল" },
  { slug: "coxsbazar", name: "কক্সবাজার" },
  { slug: "rangamati", name: "রাঙ্গামাটি" },
];

const baseTags = [
  { slug: "metro", name: "মেট্রো" },
  { slug: "weather", name: "আবহাওয়া" },
  { slug: "economy", name: "অর্থনীতি" },
  { slug: "cricket", name: "ক্রিকেট" },
  { slug: "education", name: "শিক্ষা" },
  { slug: "health", name: "স্বাস্থ্য" },
  { slug: "transport", name: "পরিবহন" },
  { slug: "gujob", name: "গুজব" },
  { slug: "factcheck", name: "ফ্যাক্ট চেক" },
  { slug: "history", name: "ইতিহাস" },
];

export const tags = [...baseTags, ...districts];