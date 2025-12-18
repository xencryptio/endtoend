/**
 * Unified API fetch wrapper with error logging
 */
export async function apiFetch(url: string, options: RequestInit = {}) {
  console.log(`[API] → ${options.method || 'GET'} ${url}`);
  
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      console.error(`[API] ✗ ${url} returned ${response.status}`);
      
      // Try to get error details
      let errorDetail;
      try {
        errorDetail = await response.json();
      } catch {
        errorDetail = await response.text();
      }
      
      console.error(`[API] Error details:`, errorDetail);
      throw new Error(`API error: ${response.status}`);
    }
    
    console.log(`[API] ✓ ${url} success`);
    return response.json();
  } catch (error) {
    console.error(`[API] ✗ ${url} failed:`, error);
    throw error;
  }
}