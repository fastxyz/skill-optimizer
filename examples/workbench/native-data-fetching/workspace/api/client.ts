import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.example.com';

interface UserData {
  name: string;
  email: string;
}

export const getUser = async (userId: string) => {
  const response = await axios.get(`${BASE_URL}/users/${userId}`);
  return response.data;
};

export const getUsers = async () => {
  const response = await fetch(`${BASE_URL}/users`);
  const data = await response.json();
  return data;
};

export const createUser = async (userData: UserData) => {
  const response = await fetch(`${BASE_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export const saveAuthToken = async (token: string) => {
  await AsyncStorage.setItem('auth_token', token);
};

export const getAuthToken = async () => {
  return AsyncStorage.getItem('auth_token');
};
