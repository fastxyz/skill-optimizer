import React, { useEffect, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import axios from 'axios';

const PAYMENT_KEY = process.env.EXPO_PUBLIC_STRIPE_SECRET_KEY;

interface Post {
  id: number;
  title: string;
}

export function DashboardScreen() {
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    fetch('https://api.example.com/profile')
      .then((r) => r.json())
      .then(setProfile);
  }, []);

  useEffect(() => {
    axios.get('https://api.example.com/posts').then((res) => {
      setPosts(res.data);
    });
  }, []);

  return (
    <View>
      <Text>Dashboard</Text>
      <FlatList
        data={posts}
        renderItem={({ item }) => <Text>{item.title}</Text>}
        keyExtractor={(item) => item.id.toString()}
      />
    </View>
  );
}
