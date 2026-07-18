/**
 * Shared scan API utility — used by both Scan Center and Web Scan pages
 */

export const connectSSEWithPost = async (
  apiBaseUrl: string,
  domains: string,
  saveToDb: boolean,
  onStart: (requestId: string) => void,
  onProgress: (data: any) => void,
  onComplete: (data: any) => void,
  onError: (error: string) => void
) => {
  try {
    const normalizedBaseUrl = apiBaseUrl.replace(/\/$/, '');
    const fullUrl = `${normalizedBaseUrl}/scan-with-progress`;

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        domain: domains,
        max_concurrent: 5,
        save_to_db: saveToDb,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) throw new Error('No response body');

    let buffer = '';
    let requestIdReceived = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));

            if (!requestIdReceived && (data.request_id || data.batch_id)) {
              onStart(data.request_id || data.batch_id);
              requestIdReceived = true;
            }

            if (data.type === 'progress_snapshot') {
              onProgress(data);
            } else if (data.type === 'domain_complete') {
              onProgress(data);
            } else if (data.type === 'complete' || data.type === 'progress_summary') {
              onComplete(data);
              return;
            } else if (data.type === 'cancelled') {
              onComplete(data);
              return;
            }
          } catch (err) {
            console.error('SSE parse error:', err);
          }
        }
      }
    }
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Unknown error');
  }
};
