import { getToken } from '/Users/jeffk/.claude/agents/api-client/index.mjs';

try {
  console.log('🔄 Fetching new MyHealth dev token from services.dataintegrities.com...');
  
  const tokenData = await getToken('myhealth', 'dev');
  
  console.log('✅ Success: MyHealth dev token retrieved');
  console.log('- Token length:', tokenData.token.length, 'characters');
  console.log('- Token preview:', tokenData.token.substring(0, 50) + '...');
  console.log('- System: myhealth');
  console.log('- Environment: dev');
  console.log('- Host: services.dataintegrities.com');
  console.log('- Patient ID:', tokenData.patientId || tokenData.patient_id);
  console.log('- Refresh token available:', !!tokenData.refresh_token);
  console.log('- Cached at:', tokenData.cached_at);
  
} catch (error) {
  console.log('❌ Error: Failed to get MyHealth dev token');
  console.log('- Details:', error.message);
  if (error.stack) {
    console.log('- Stack trace:', error.stack);
  }
}