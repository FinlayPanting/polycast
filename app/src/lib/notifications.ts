import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { supabase } from './supabase'

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
})

/**
 * Asks once, at the moment it's useful (a learner's first episode starts preparing), so "your episode
 * is ready" can reach them. Stores the push token on their profile.
 */
export async function enableReadyNotifications(userId: string): Promise<boolean> {
  if (!Device.isDevice) return false
  const current = await Notifications.getPermissionsAsync()
  const status = current.granted ? current : await Notifications.requestPermissionsAsync()
  if (!status.granted) return false
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
  const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data
  await supabase.from('profiles').update({ push_token: token }).eq('id', userId)
  return true
}
