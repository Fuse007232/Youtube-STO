/** Ausschnitte der Antworten der YouTube Data API v3 (nur was wir brauchen). */

export interface YtThumbnail {
  url: string;
  width?: number;
  height?: number;
}

export type YtThumbnails = Partial<Record<"default" | "medium" | "high" | "standard" | "maxres", YtThumbnail>>;

export interface YtChannel {
  id: string;
  snippet?: { title: string; customUrl?: string; thumbnails?: YtThumbnails };
  statistics?: {
    viewCount?: string;
    subscriberCount?: string;
    hiddenSubscriberCount?: boolean;
    videoCount?: string;
  };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

export interface YtPlaylistItem {
  contentDetails?: { videoId: string; videoPublishedAt?: string };
}

export interface YtVideo {
  id: string;
  snippet?: { title: string; publishedAt: string; channelId: string; thumbnails?: YtThumbnails };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
}

export interface YtListResponse<T> {
  items?: T[];
  nextPageToken?: string;
  pageInfo?: { totalResults: number; resultsPerPage: number };
}

export interface YtErrorResponse {
  error?: {
    code: number;
    message: string;
    errors?: { reason?: string; message?: string }[];
    details?: { reason?: string }[];
  };
}
