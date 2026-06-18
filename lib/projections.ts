import type { Recommendation } from "./sheets";
import type { PortfolioRole } from "./rbac";

const CLIENT_LINK_LIMIT = 3;

function splitLinks(newsLinks: string): string[] {
  return newsLinks
    .split(",")
    .map((link) => link.trim())
    .filter(Boolean);
}

function limitedNewsLinks(newsLinks: string): string {
  return splitLinks(newsLinks).slice(0, CLIENT_LINK_LIMIT).join(", ");
}

export interface NewsItem {
  date: string;
  ticker: string;
  action: string;
  rationale: string;
  links: string[];
}

export function projectRecommendationForRole(recommendation: Recommendation, role: PortfolioRole): Recommendation {
  if (role === "FundManager") {
    return recommendation;
  }

  return {
    date: recommendation.date,
    ticker: recommendation.ticker,
    action: recommendation.action,
    quantScore: recommendation.quantScore,
    rationale: recommendation.rationale,
    newsLinks: limitedNewsLinks(recommendation.newsLinks),
    status: recommendation.status,
  };
}

export function projectRecommendationsForRole(recommendations: Recommendation[], role: PortfolioRole): Recommendation[] {
  return recommendations.map((recommendation) => projectRecommendationForRole(recommendation, role));
}

export function projectNewsForRole(recommendations: Recommendation[], role: PortfolioRole): NewsItem[] {
  return recommendations
    .filter((r) => r.newsLinks && r.newsLinks.trim().length > 0)
    .map((r) => {
      const links = splitLinks(r.newsLinks);
      return {
        date: r.date,
        ticker: r.ticker,
        action: r.action,
        rationale: r.rationale,
        links: role === "FundManager" ? links : links.slice(0, CLIENT_LINK_LIMIT),
      };
    })
    .reverse();
}
