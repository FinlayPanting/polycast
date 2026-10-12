import TrackPlayer from 'react-native-track-player'
import { playbackService } from './src/player/remote'

TrackPlayer.registerPlaybackService(() => playbackService)

import 'expo-router/entry'
