import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { supabase } from './supabase'
import { deviceTimeZone } from './timeZone'

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
})

/**
 * Asks once, at the moment it's useful (a learner's first episode starts preparing), so "your episode
 * is ready" can reach them. Stores the push token on their profile, with the phone's time zone so nudges
 * arrive in their own daytime (PC-1028-01).
 */
export async function enableReadyNotifications(userId: string): Promise<boolean> {
  if (!Device.isDevice) return false
  const current = await Notifications.getPermissionsAsync()
  const status = current.granted ? current : await Notifications.requestPermissionsAsync()
  if (!status.granted) return false
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
  const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data
  const timeZone = deviceTimeZone()
  await supabase.from('profiles').update(timeZone ? { push_token: token, time_zone: timeZone } : { push_token: token }).eq('id', userId)
  return true
}
