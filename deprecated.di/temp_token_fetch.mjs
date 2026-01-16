import { getToken } from '/Users/jeffk/.claude/agents/api-client/index.mjs';

try {
  console.log('🔄 Fetching new MyHealth dev token from services.dataintegrities.com...');
  
  const token = await getToken('myhealth', 'dev');
  
  console.log('✅ Success: MyHealth dev token retrieved');
  console.log('- Token length:', token.length, 'characters');
  console.log('- Token preview:', token.substring(0, 50) + '...');
  console.log('- Host: services.dataintegrities.com');
  console.log('- System: myhealth');
  console.log('- Environment: dev');
  
} catch (error) {
  console.log('❌ Error: Failed to get MyHealth dev token');
  console.log('- Details:', error.message);
  if (error.stack) {
    console.log('- Stack trace:', error.stack);
  }
}