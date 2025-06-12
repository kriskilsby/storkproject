
// export async function runClustering(method = 'kmeans', params = {}) {
//   try {
//     const response = await fetch('/api/cluster', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ method, params }),
//     });

//     if (!response.ok) {
//       throw new Error('Failed to run clustering');
//     }

//     const result = await response.json();
//     console.log('Clustering result:', result);

//     // Optionally: return the result for use in UI
//     return result;

//   } catch (error) {
//     console.error('Error calling clustering API:', error);
//     return { error: error.message };
//   }
// }
