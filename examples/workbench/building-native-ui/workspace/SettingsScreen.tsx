import React, { useContext } from 'react';
import { View, ScrollView, Text, Picker } from 'react-native';
import Permissions from 'expo-permissions';

const ThemeContext = React.createContext({ dark: false });

export default function SettingsScreen() {
  const theme = useContext(ThemeContext);

  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 18 }}>Settings</Text>
        <img src="settings-icon.png" style={{ width: 24, height: 24 }} />
        <Picker
          selectedValue="option1"
          onValueChange={() => {}}
        >
          <Picker.Item label="Option 1" value="option1" />
        </Picker>
      </View>
    </ScrollView>
  );
}
