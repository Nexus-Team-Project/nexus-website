export type ArticleCategory = 'gifts' | 'benefits' | 'loyalty';

export type ArticleSection =
  | { type: 'heading'; level: 2 | 3; text: string; id: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'callout'; text: string; icon?: string }
  | { type: 'image'; src: string; alt: string; caption?: string };

export interface ArticleFAQ {
  question: string;
  answer: string;
}

export interface ArticleAuthor {
  name: string;
  role: string;
  avatar?: string;
}

export interface Article {
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  category: ArticleCategory;
  heroImage: string;
  author: ArticleAuthor;
  publishDate: string;
  readTime: number;
  sections: ArticleSection[];
  faq: ArticleFAQ[];
}
