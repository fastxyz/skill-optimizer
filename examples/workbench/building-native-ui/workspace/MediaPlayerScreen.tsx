import React from 'react';
import { View, Text, Dimensions, Platform, SafeAreaView, StyleSheet } from 'react-native';
import { Video } from 'expo-av';

const { width: screenWidth } = Dimensions.get('window');

export default function MediaPlayerScreen() {
  const isIOS = Platform.OS === 'ios';

  return (
    <SafeAreaView style={styles.container}>
      <Video
        source={{ uri: 'https://example.com/video.mp4' }}
        style={{ width: screenWidth, height: 300 }}
        useNativeControls
        resizeMode="contain"
      />
      <View style={styles.card}>
        <Text>{isIOS ? 'Playing on iOS' : 'Playing'}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  card: {
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
    borderRadius: 8,
  },
});
