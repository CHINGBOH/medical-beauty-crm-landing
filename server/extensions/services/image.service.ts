import axios from 'axios';
import { config } from '../config';

export class ImageService {
  // 使用内置AI生成图片
  async generateImage(params: {
    prompt: string;
    style?: 'modern' | 'elegant' | 'vibrant' | 'minimal';
    size?: 'square' | 'portrait' | 'landscape';
  }): Promise<string> {
    try {
      const enhancedPrompt = this.enhancePrompt(params.prompt, params.style);
      
      // 使用内置Forge API
      const response = await axios.post(
        config.forgeApiUrl + '/generate-image',
        {
          prompt: enhancedPrompt,
          style: params.style || 'modern',
          aspect_ratio: this.getAspectRatio(params.size),
          num_images: 1
        },
        {
          headers: {
            'Authorization': `Bearer ${config.forgeApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.images[0].url;
    } catch (error) {
      console.error('图片生成失败:', error);
      // 备用方案：返回占位图
      return this.getPlaceholderImage(params.style);
    }
  }

  // 为小红书生成配图
  async generateXiaohongshuImages(content: string, projectType: string): Promise<string[]> {
    const imagePrompts = [
      `医美项目 ${projectType} 前后对比效果图，专业、真实、有说服力`,
      `${projectType} 治疗过程，环境温馨专业，设备先进`,
      `做完 ${projectType} 后的自拍，皮肤细腻有光泽，自然光`,
      `医生专业操作 ${projectType} 设备，专注认真`
    ];

    const images: string[] = [];
    for (const prompt of imagePrompts.slice(0, 3)) {
      const imageUrl = await this.generateImage({
        prompt,
        style: 'elegant',
        size: 'square'
      });
      images.push(imageUrl);
    }

    return images;
  }

  private enhancePrompt(basePrompt: string, style?: string): string {
    const stylePrompts = {
      modern: '现代简约风格，干净线条，中性色调，专业感',
      elegant: '优雅高级风格，柔和灯光，浅色调，有质感',
      vibrant: '活力鲜艳风格，明亮色彩，生动活泼，吸引眼球',
      minimal: '极简主义风格，留白多，焦点突出，清新'
    };

    const stylePrompt = style ? stylePrompts[style] || stylePrompts.modern : stylePrompts.modern;
    
    return `医美相关内容，${basePrompt}，${stylePrompt}，高清，细节丰富，专业摄影，小红书风格，适合社交媒体分享`;
  }

  private getAspectRatio(size?: string): string {
    const ratios = {
      square: '1:1',
      portrait: '3:4',
      landscape: '4:3'
    };
    return ratios[size as keyof typeof ratios] || ratios.square;
  }

  private getPlaceholderImage(style?: string): string {
    const colors = {
      modern: '4A5568',
      elegant: 'B8A68D',
      vibrant: 'F56565',
      minimal: 'EDF2F7'
    };
    const color = colors[style as keyof typeof colors] || colors.modern;
    
    return `https://via.placeholder.com/800x800/${color}/FFFFFF?text=${encodeURIComponent('医美配图')}`;
  }
}