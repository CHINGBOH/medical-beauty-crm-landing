import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

interface WeatherData {
  temp: number;
  text: string;
  humidity: number;
  aqi: number;
  tempChange: number;
  forecast: Array<{
    date: string;
    tempMin: number;
    tempMax: number;
    text: string;
  }>;
  lastUpdated: Date;
}

export class WeatherService {
  private apiKey: string;
  private cache: Map<string, { data: WeatherData; timestamp: number }> = new Map();
  private CACHE_DURATION = 30 * 60 * 1000; // 30分钟缓存

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // 获取当前天气
  async getCurrentWeather(location = '101280601'): Promise<WeatherData> {
    const cacheKey = `weather_${location}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    try {
      const [nowResponse, forecastResponse, airResponse] = await Promise.all([
        this.fetchWeatherNow(location),
        this.fetchWeatherForecast(location),
        this.fetchAirQuality(location)
      ]);

      const weatherData: WeatherData = {
        temp: parseInt(nowResponse.temp),
        text: nowResponse.text,
        humidity: parseInt(nowResponse.humidity),
        aqi: parseInt(airResponse.aqi),
        tempChange: await this.calculateTemperatureChange(location),
        forecast: forecastResponse.map((day: any) => ({
          date: day.fxDate,
          tempMin: parseInt(day.tempMin),
          tempMax: parseInt(day.tempMax),
          text: day.textDay
        })),
        lastUpdated: new Date()
      };

      this.cache.set(cacheKey, {
        data: weatherData,
        timestamp: Date.now()
      });

      return weatherData;
    } catch (error) {
      logger.error('获取天气数据失败:', error);
      throw error;
    }
  }

  // 计算温差（与前一天对比）
  private async calculateTemperatureChange(location: string): Promise<number> {
    try {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      const response = await axios.get(
        `https://devapi.qweather.com/v7/historical/weather`,
        {
          params: {
            location,
            date: yesterdayStr,
            key: this.apiKey
          }
        }
      );

      const yesterdayTemp = response.data.weather.temp;
      const todayTemp = await this.getTodayTemperature(location);
      
      return todayTemp - yesterdayTemp;
    } catch (error) {
      logger.error('计算温差失败:', error);
      return 0;
    }
  }

  private async getTodayTemperature(location: string): Promise<number> {
    const response = await this.fetchWeatherNow(location);
    return parseInt(response.temp);
  }

  private async fetchWeatherNow(location: string): Promise<any> {
    const response = await axios.get(
      'https://devapi.qweather.com/v7/weather/now',
      {
        params: { location, key: this.apiKey }
      }
    );
    return response.data.now;
  }

  private async fetchWeatherForecast(location: string): Promise<any[]> {
    const response = await axios.get(
      'https://devapi.qweather.com/v7/weather/7d',
      {
        params: { location, key: this.apiKey }
      }
    );
    return response.data.daily;
  }

  private async fetchAirQuality(location: string): Promise<any> {
    const response = await axios.get(
      'https://devapi.qweather.com/v7/air/now',
      {
        params: { location, key: this.apiKey }
      }
    );
    return response.data.now;
  }

  // 获取天气警报
  async getWeatherAlerts(location = '101280601'): Promise<string[]> {
    try {
      const response = await axios.get(
        'https://devapi.qweather.com/v7/warning/now',
        {
          params: { location, key: this.apiKey }
        }
      );

      if (response.data.warning && response.data.warning.length > 0) {
        return response.data.warning.map((w: any) => w.title);
      }

      return [];
    } catch (error) {
      logger.error('获取天气警报失败:', error);
      return [];
    }
  }

  // 检查是否满足触发器条件
  checkWeatherCondition(weather: WeatherData, condition: any): boolean {
    switch (condition.weatherType) {
      case 'temperature_drop':
        return weather.tempChange <= condition.value;
        
      case 'temperature_rise':
        return weather.tempChange >= condition.value;
        
      case 'high_temperature':
        return weather.temp >= condition.value;
        
      case 'low_temperature':
        return weather.temp <= condition.value;
        
      case 'air_quality':
        return weather.aqi >= condition.value;
        
      case 'rainy':
        return weather.text.includes('雨');
        
      case 'windy':
        return weather.text.includes('风');
        
      default:
        return false;
    }
  }
}