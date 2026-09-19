const siteUrl = (
  import.meta.env.SITE_URL ||
  import.meta.env.PUBLIC_SITE_URL ||
  "https://newsdesk-bd.vercel.app"
).replace(/\/$/, "");

export const SITE = {
  name: "নিউজডেস্ক বিডি",
  tagline: "বাংলাদেশের সবচেয়ে যাচাই-করা সংবাদ",
  description:
    "নিউজডেস্ক বিডি — বাংলাদেশের একাধিক পত্রিকা থেকে একই ঘটনার খবর যাচাই করে একটিমাত্র মূল ও প্রমাণসহ সংবাদ হিসেবে প্রকাশ করে। প্রতিটি সংবাদের সাথে সূত্র ও প্রমাণ একসঙ্গে দেখা যায়।",
  url: siteUrl,
  locale: "bn-BD",
  language: "bn",
  repositoryUrl: "https://github.com/",
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
  { to: "/about", label: "আমাদের সম্পর্কে" },
  { to: "/contact", label: "যোগাযোগ" },
];

export const CONTACT = {
  email: "",
  socialHandle: "@newsdeskbd",
  socialUrl: "https://x.com/newsdeskbd",
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
  { href: "/rss.xml", label: "RSS ফিড", icon: "rss" },
  { href: CONTACT.socialUrl, label: `${SITE.name} X (টুইটার)`, icon: "twitter" },
  { href: SITE.repositoryUrl, label: `${SITE.name} GitHub`, icon: "github" },
];

export const authors = [
  {
    slug: "desk",
    name: "নিউজডেস্ক ডেস্ক",
    shortName: "নিউজডেস্ক",
    bio: "নিউজডেস্ক বিডির স্বয়ংক্রিয় সংবাদ ডেস্ক — একাধিক পত্রিকা ও দাপ্তরিক সূত্র থেকে সংবাদ যাচাই করে প্রকাশ করা হয়।",
    longBio:
      "নিউজডেস্ক ডেস্ক স্বয়ংক্রিয় পাইপলাইনের মাধ্যমে ১২টিরও বেশি বাংলাদেশি সংবাদমাধ্যম ও সরকারি-সংস্থার তথ্য সংগ্রহ করে, একই ঘটনার একাধিক প্রতিবেদন মিলিয়ে একটি নির্ভরযোগ্য, প্রমাণসহ সংবাদ তৈরি করে। প্রতিটি সংবাদের প্রতিটি তথ্য সূত্রেব্যবহারে ফিরে দেখা যায়।",
    avatar: "/avatars/desk.svg",
  },
];

const renderCategory = (slug, name, color) => ({ slug, name, color });

export const categories = [
  renderCategory("national", "জাতীয়", "#c0392b"),
  renderCategory("politics", "রাজনীতি", "#7b241c"),
  renderCategory("economy", "অর্থনীতি", "#148f77"),
  renderCategory("international", "আন্তর্জাতিক", "#2e86c1"),
  renderCategory("sports", "ক্রীড়া", "#1e8449"),
  renderCategory("entertainment", "বিনোদন", "#7d3c98"),
  renderCategory("tech", "প্রযুক্তি", "#117a8b"),
  renderCategory("opinion", "মতামত/বিশ্লেষণ", "#b9770e"),
  renderCategory("latest", "সর্বশেষ", "#5d6d7e"),
];

export const tags = [
  { slug: "dhaka", name: "ঢাকা" },
  { slug: "metro", name: "মেট্রো" },
  { slug: "weather", name: "আবহাওয়া" },
  { slug: "economy", name: "অর্থনীতি" },
  { slug: "cricket", name: "ক্রিকেট" },
  { slug: "education", name: "শিক্ষা" },
  { slug: "health", name: "স্বাস্থ্য" },
  { slug: "transport", name: "পরিবহন" },
];