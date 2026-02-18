import { Request, Response } from 'express';

interface GoogleReviewResponseItem {
  author_name?: string;
  profile_photo_url?: string;
  rating?: number;
  relative_time_description?: string;
  text?: string;
  time?: number;
}

interface ReviewsCache {
  expiresAt: number;
  data: {
    businessName: string;
    rating: number;
    totalRatings: number;
    reviews: Array<{
      authorName: string;
      profilePhotoUrl: string;
      rating: number;
      text: string;
      reviewTime: number;
      relativeTimeDescription: string;
      createdAt: string;
    }>;
    cachedAt: string;
  };
}

let reviewsCache: ReviewsCache | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const buildFallbackPayload = () => ({
  businessName: '517 VIP Suites & Apartments',
  rating: 0,
  totalRatings: 0,
  reviews: [],
  cachedAt: new Date().toISOString(),
});

const mapReviews = (reviews: GoogleReviewResponseItem[]) =>
  reviews
    .map((review) => {
      const reviewTime = Number(review.time || 0);
      return {
        authorName: review.author_name || 'Anonymous',
        profilePhotoUrl: review.profile_photo_url || '',
        rating: Number(review.rating || 0),
        text: review.text || '',
        reviewTime,
        relativeTimeDescription: review.relative_time_description || '',
        createdAt: reviewTime ? new Date(reviewTime * 1000).toISOString() : '',
      };
    })
    .sort((a, b) => b.reviewTime - a.reviewTime);

const fetchGoogleReviews = async () => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
  const placeId = process.env.GOOGLE_PLACE_ID || '';

  if (!apiKey || !placeId) {
    return buildFallbackPayload();
  }

  const url =
    `https://maps.googleapis.com/maps/api/place/details/json?` +
    `place_id=${encodeURIComponent(placeId)}&fields=name,rating,user_ratings_total,reviews&key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url);
  const payload = (await response.json()) as {
    status?: string;
    result?: {
      name?: string;
      rating?: number;
      user_ratings_total?: number;
      reviews?: GoogleReviewResponseItem[];
    };
  };

  if (!response.ok || payload.status !== 'OK' || !payload.result) {
    return buildFallbackPayload();
  }

  return {
    businessName: payload.result.name || '517 VIP Suites & Apartments',
    rating: Number(payload.result.rating || 0),
    totalRatings: Number(payload.result.user_ratings_total || 0),
    reviews: mapReviews(payload.result.reviews || []),
    cachedAt: new Date().toISOString(),
  };
};

export const getGoogleReviews = async (_req: Request, res: Response) => {
  try {
    if (reviewsCache && reviewsCache.expiresAt > Date.now()) {
      return res.json(reviewsCache.data);
    }

    const data = await fetchGoogleReviews();
    reviewsCache = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data,
    };

    return res.json(data);
  } catch (_error) {
    return res.status(500).json({ error: 'Unable to fetch google reviews' });
  }
};
