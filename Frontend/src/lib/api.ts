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
    
            const contentType = response.headers.get("content-type");
    
            if (contentType?.includes("application/json")) {
    
              errorDetail = await response.json();
    
            } else {
    
              errorDetail = await response.text();
    
            }
    
          } catch {
    
            errorDetail = "Could not parse error response";
    
          }
    
          
    
          console.error(`[API] Error details:`, errorDetail);
    
          throw new Error(`API error: ${response.status}`);
    
        }
    
        
    
        const contentType = response.headers.get("content-type");
    
        if (!contentType?.includes("application/json")) {
    
          const text = await response.text();
    
          console.error(`[API] Expected JSON but got ${contentType}:`, text.slice(0, 200));
    
          throw new Error(`Expected JSON but got ${contentType}`);
    
        }
    
    
    
        console.log(`[API] ✓ ${url} success`);
    
        return response.json();
    
      } catch (error) {
    
        console.error(`[API] ✗ ${url} failed:`, error);
    
        throw error;
    
      }
    
    }
    
    