// apps/api/src/services/youtube.service.ts

import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch, { Response } from 'node-fetch';
import { YoutubeTranscript } from 'youtube-transcript-plus';

const PROXY_URL = process.env.PROXY_URL;
const proxyAgent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : undefined;

const fetchWithProxy = async (
  url: string,
  options: any = {},
): Promise<Response> => {
  const response = fetch(url, { ...options, agent: proxyAgent });
  return response as any;
};

/**
 * Extracts and formats a transcript from a given YouTube video ID.
 * @param videoId The ID of the YouTube video (e.g., 'dQw4w9WgXcQ')
 * @returns The full, concatenated transcript text.
 */
export async function fetchAndFormatTranscript(
  videoId: string,
): Promise<string> {
  console.log({ videoId });

  const config = {
    lang: 'en',
    // Pass the custom fetch function for all three types of requests
    // This ensures all YouTube-related network traffic goes through the proxy
    videoFetch: ({ url, lang, userAgent }: any) =>
      fetchWithProxy(url, {
        headers: {
          ...(lang && { 'Accept-Language': lang }),
          'User-Agent': userAgent,
        },
      }),
    playerFetch: ({ url, method, body, headers, lang, userAgent }: any) =>
      fetchWithProxy(url, {
        method,
        body,
        headers: {
          ...(lang && { 'Accept-Language': lang }),
          'User-Agent': userAgent,
          ...headers,
        },
      }),
    transcriptFetch: ({ url, lang, userAgent }: any) =>
      fetchWithProxy(url, {
        headers: {
          ...(lang && { 'Accept-Language': lang }),
          'User-Agent': userAgent,
        },
      }),
  };

  // 1. Fetch the raw transcript data
  const rawTranscript = await YoutubeTranscript.fetchTranscript(
    videoId,
    config,
  );
  console.log({ rawTranscript });

  if (!rawTranscript || rawTranscript.length === 0) {
    throw new Error(`Transcript not found for video ID: ${videoId}`);
  }

  // 2. Format the data: Concatenate the segments into a single, clean text string.
  const fullTranscript = rawTranscript
    .map((segment) => segment.text)
    .join(' ')
    .replace(/\s+/g, ' ') // Replace multiple spaces/newlines with a single space
    .trim();

  return fullTranscript;
}
