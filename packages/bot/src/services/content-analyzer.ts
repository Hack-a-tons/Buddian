import axios from 'axios';
import sharp from 'sharp';
import pdfParse from 'pdf-parse';
import * as cheerio from 'cheerio';
import { contentLogger, logError, logContentAnalysis } from '@/utils/logger';
import { visionConfig } from '@/config/env';
import { 
  ContentAnalysisResult, 
  ResourceMetadata, 
  BuddianError 
} from '@/types';

// Content type detection
export const detectContentType = (filename: string, mimeType?: string): string => {
  const extension = filename.toLowerCase().split('.').pop();
  
  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
  }
  
  switch (extension) {
    case 'pdf':
      return 'pdf';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
    case 'bmp':
      return 'image';
    case 'mp4':
    case 'avi':
    case 'mov':
    case 'wmv':
    case 'flv':
      return 'video';
    case 'mp3':
    case 'wav':
    case 'ogg':
    case 'flac':
      return 'audio';
    default:
      return 'unknown';
  }
};

// PDF analysis service
export const pdfService = {
  async extractText(buffer: Buffer): Promise<ContentAnalysisResult> {
    const startTime = Date.now();
    
    try {
      const data = await pdfParse(buffer);
      const duration = Date.now() - startTime;
      
      logContentAnalysis(
        contentLogger,
        'pdf',
        'text_extraction',
        true,
        duration,
        { pages: data.numpages, textLength: data.text.length }
      );
      
      return {
        content: data.text,
        summary: data.text.substring(0, 500) + (data.text.length > 500 ? '...' : ''),
        language: 'unknown', // Will be detected later
        metadata: {
          pages: data.numpages,
          mimeType: 'application/pdf',
          title: data.info?.Title || undefined,
          author: data.info?.Author || undefined,
        },
        extractedText: data.text,
        keyPoints: []
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logError(contentLogger, error as Error, { 
        operation: 'pdf_extraction', 
        duration 
      });
      
      throw new BuddianError(
        `Failed to extract text from PDF: ${(error as Error).message}`,
        'PDF_EXTRACTION_ERROR',
        500,
        { originalError: (error as Error).message }
      );
    }
  },

  async extractMetadata(buffer: Buffer): Promise<ResourceMetadata> {
    try {
      const data = await pdfParse(buffer);
      
      return {
        pages: data.numpages,
        mimeType: 'application/pdf',
        size: buffer.length,
        title: data.info?.Title || undefined,
        author: data.info?.Author || undefined,
      };
    } catch (error) {
      logError(contentLogger, error as Error, { operation: 'pdf_metadata' });
      
      return {
        mimeType: 'application/pdf',
        size: buffer.length,
      };
    }
  }
};

// Image analysis service
export const imageService = {
  async analyzeImage(buffer: Buffer, filename: string): Promise<ContentAnalysisResult> {
    const startTime = Date.now();
    
    try {
      // Get image metadata using Sharp
      const metadata = await sharp(buffer).metadata();
      
      // For now, we'll return basic image info
      // In a full implementation, this would use Azure Computer Vision API
      const description = `Image file: ${filename}`;
      const summary = `${metadata.format?.toUpperCase()} image, ${metadata.width}x${metadata.height} pixels`;
      
      const duration = Date.now() - startTime;
      
      logContentAnalysis(
        contentLogger,
        'image',
        'basic_analysis',
        true,
        duration,
        { 
          format: metadata.format,
          width: metadata.width,
          height: metadata.height 
        }
      );
      
      return {
        content: description,
        summary,
        language: 'unknown',
        metadata: {
          mimeType: `image/${metadata.format}`,
          size: buffer.length,
          dimensions: {
            width: metadata.width || 0,
            height: metadata.height || 0
          }
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logError(contentLogger, error as Error, { 
        operation: 'image_analysis', 
        duration,
        filename 
      });
      
      throw new BuddianError(
        `Failed to analyze image: ${(error as Error).message}`,
        'IMAGE_ANALYSIS_ERROR',
        500,
        { filename, originalError: (error as Error).message }
      );
    }
  },

  async extractImageText(_buffer: Buffer): Promise<string> {
    // This would use Azure Computer Vision OCR API
    // For now, return empty string as placeholder
    if (!visionConfig) {
      contentLogger.warn('Azure Vision not configured, skipping OCR');
      return '';
    }
    
    try {
      // Placeholder for Azure Computer Vision OCR
      // const result = await visionClient.recognizeText(buffer);
      // return result.text;
      return '';
    } catch (error) {
      logError(contentLogger, error as Error, { operation: 'image_ocr' });
      return '';
    }
  },

  async getImageMetadata(buffer: Buffer): Promise<ResourceMetadata> {
    try {
      const metadata = await sharp(buffer).metadata();
      
      return {
        mimeType: `image/${metadata.format}`,
        size: buffer.length,
        dimensions: {
          width: metadata.width || 0,
          height: metadata.height || 0
        }
      };
    } catch (error) {
      logError(contentLogger, error as Error, { operation: 'image_metadata' });
      
      return {
        mimeType: 'image/unknown',
        size: buffer.length,
      };
    }
  }
};

// Web content scraping service
export const webService = {
  async scrapeUrl(url: string): Promise<ContentAnalysisResult> {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Buddian Bot 1.0 (Content Analyzer)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 400,
      });
      
      const $ = cheerio.load(response.data);
      
      // Remove script and style elements
      $('script, style, nav, footer, aside, .advertisement, .ads').remove();
      
      // Extract title
      const title = $('title').text().trim() || 
                   $('h1').first().text().trim() || 
                   'Untitled';
      
      // Extract main content
      const contentSelectors = [
        'article',
        'main',
        '.content',
        '.post-content',
        '.entry-content',
        '.article-content',
        '#content',
        '.main-content'
      ];
      
      let content = '';
      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
          content = element.text().trim();
          break;
        }
      }
      
      // Fallback to body content if no specific content area found
      if (!content) {
        content = $('body').text().trim();
      }
      
      // Clean up whitespace
      content = content.replace(/\s+/g, ' ').trim();
      
      // Extract meta description
      const description = $('meta[name="description"]').attr('content') || 
                         $('meta[property="og:description"]').attr('content') || 
                         content.substring(0, 200) + '...';
      
      const duration = Date.now() - startTime;
      
      logContentAnalysis(
        contentLogger,
        'url',
        'web_scraping',
        true,
        duration,
        { 
          url: url.substring(0, 100),
          contentLength: content.length,
          title: title.substring(0, 50)
        }
      );
      
      return {
        content,
        summary: description,
        language: 'unknown', // Will be detected later
        metadata: {
          title,
          mimeType: 'text/html',
          size: content.length,
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logError(contentLogger, error as Error, { 
        operation: 'web_scraping', 
        duration,
        url: url.substring(0, 100)
      });
      
      throw new BuddianError(
        `Failed to scrape URL: ${(error as Error).message}`,
        'WEB_SCRAPING_ERROR',
        500,
        { url, originalError: (error as Error).message }
      );
    }
  },

  async extractUrlMetadata(url: string): Promise<ResourceMetadata> {
    try {
      const response = await axios.head(url, {
        timeout: 10000,
        maxRedirects: 5,
      });
      
      return {
        mimeType: response.headers['content-type']?.split(';')[0] || 'text/html',
        size: parseInt(response.headers['content-length'] || '0', 10),
      };
    } catch (error) {
      logError(contentLogger, error as Error, { 
        operation: 'url_metadata',
        url: url.substring(0, 100)
      });
      
      return {
        mimeType: 'text/html',
      };
    }
  }
};

// File download service
export const downloadService = {
  async downloadFile(url: string, maxSize: number = 50 * 1024 * 1024): Promise<Buffer> {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: maxSize,
        headers: {
          'User-Agent': 'Buddian Bot 1.0 (File Downloader)',
        },
      });
      
      const buffer = Buffer.from(response.data);
      const duration = Date.now() - startTime;
      
      contentLogger.info('File downloaded successfully', {
        url: url.substring(0, 100),
        size: buffer.length,
        duration,
        contentType: response.headers['content-type']
      });
      
      return buffer;
    } catch (error) {
      const duration = Date.now() - startTime;
      logError(contentLogger, error as Error, { 
        operation: 'file_download', 
        duration,
        url: url.substring(0, 100)
      });
      
      throw new BuddianError(
        `Failed to download file: ${(error as Error).message}`,
        'FILE_DOWNLOAD_ERROR',
        500,
        { url, originalError: (error as Error).message }
      );
    }
  }
};

// Main content analyzer
export const contentAnalyzer = {
  async analyzeContent(
    input: Buffer | string,
    type: 'pdf' | 'image' | 'url',
    filename?: string
  ): Promise<ContentAnalysisResult> {
    const startTime = Date.now();
    
    try {
      let result: ContentAnalysisResult;
      
      switch (type) {
        case 'pdf':
          if (!(input instanceof Buffer)) {
            throw new BuddianError('PDF analysis requires Buffer input', 'INVALID_INPUT');
          }
          result = await pdfService.extractText(input);
          break;
          
        case 'image':
          if (!(input instanceof Buffer)) {
            throw new BuddianError('Image analysis requires Buffer input', 'INVALID_INPUT');
          }
          result = await imageService.analyzeImage(input, filename || 'image');
          break;
          
        case 'url':
          if (typeof input !== 'string') {
            throw new BuddianError('URL analysis requires string input', 'INVALID_INPUT');
          }
          result = await webService.scrapeUrl(input);
          break;
          
        default:
          throw new BuddianError(`Unsupported content type: ${type}`, 'UNSUPPORTED_TYPE');
      }
      
      const duration = Date.now() - startTime;
      
      logContentAnalysis(
        contentLogger,
        type,
        'full_analysis',
        true,
        duration,
        { 
          contentLength: result.content.length,
          summaryLength: result.summary.length
        }
      );
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (error instanceof BuddianError) {
        throw error;
      }
      
      logError(contentLogger, error as Error, { 
        operation: 'content_analysis', 
        duration,
        type,
        filename
      });
      
      throw new BuddianError(
        `Content analysis failed: ${(error as Error).message}`,
        'CONTENT_ANALYSIS_ERROR',
        500,
        { type, filename, originalError: (error as Error).message }
      );
    }
  },

  async extractMetadata(
    input: Buffer | string,
    type: 'pdf' | 'image' | 'url',
    filename?: string
  ): Promise<ResourceMetadata> {
    try {
      switch (type) {
        case 'pdf':
          if (!(input instanceof Buffer)) {
            throw new BuddianError('PDF metadata extraction requires Buffer input', 'INVALID_INPUT');
          }
          return await pdfService.extractMetadata(input);
          
        case 'image':
          if (!(input instanceof Buffer)) {
            throw new BuddianError('Image metadata extraction requires Buffer input', 'INVALID_INPUT');
          }
          return await imageService.getImageMetadata(input);
          
        case 'url':
          if (typeof input !== 'string') {
            throw new BuddianError('URL metadata extraction requires string input', 'INVALID_INPUT');
          }
          return await webService.extractUrlMetadata(input);
          
        default:
          throw new BuddianError(`Unsupported content type: ${type}`, 'UNSUPPORTED_TYPE');
      }
    } catch (error) {
      if (error instanceof BuddianError) {
        throw error;
      }
      
      logError(contentLogger, error as Error, { 
        operation: 'metadata_extraction',
        type,
        filename
      });
      
      // Return basic metadata on error
      return {
        mimeType: 'application/octet-stream',
        size: input instanceof Buffer ? input.length : 0,
      };
    }
  }
};

// Export all services
export default {
  pdf: pdfService,
  image: imageService,
  web: webService,
  download: downloadService,
  analyzer: contentAnalyzer,
  detectContentType
};
