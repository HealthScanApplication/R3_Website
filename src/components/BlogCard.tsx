import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Calendar, Clock, ExternalLink, User } from 'lucide-react';
import { OptimizedImage } from './OptimizedImage';

interface BlogCardProps {
  title: string;
  excerpt: string;
  author: string;
  publishDate: string;
  readTime: string;
  imageUrl?: string;
  tags: string[];
  link: string;
  category?: string;
  id?: string;
}

export function BlogCard({
  title,
  excerpt,
  author,
  publishDate,
  readTime,
  imageUrl,
  tags,
  link,
  category,
  id
}: BlogCardProps) {
  const isSampleArticle = id?.startsWith('sample-');
  
  const handleReadMore = () => {
    if (isSampleArticle) {
      // For sample articles, don't try to open external links
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  return (
    <Card className="h-full group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border border-gray-200 overflow-hidden bg-white">
      {/* Article Image */}
      {imageUrl && (
        <div className="relative overflow-hidden">
          <OptimizedImage
            src={imageUrl}
            alt={title}
            className="transition-transform duration-300 group-hover:scale-105"
            style={{ height: 192 }}
          />
          {category && (
            <Badge 
              variant="secondary" 
              className="absolute top-3 left-3 bg-[var(--healthscan-green)] text-white"
            >
              {category}
            </Badge>
          )}
        </div>
      )}

      <CardHeader className="pb-3">
        <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            <span>{formatDate(publishDate)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>{readTime}</span>
          </div>
        </div>
        
        <CardTitle className="line-clamp-2 group-hover:text-[var(--healthscan-green)] transition-colors duration-300">
          {title}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col flex-1">
        <p className="text-gray-600 line-clamp-3 mb-4 flex-1">
          {excerpt}
        </p>

        {/* Author */}
        <div className="flex items-center gap-2 mb-4">
          <User className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-600">by {author}</span>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {tags.slice(0, 3).map((tag, index) => (
              <Badge 
                key={index} 
                variant="outline"
                className="text-xs"
              >
                {tag}
              </Badge>
            ))}
            {tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{tags.length - 3} more
              </Badge>
            )}
          </div>
        )}

        {/* Read More Button */}
        <Button 
          onClick={handleReadMore}
          variant="outline"
          disabled={isSampleArticle}
          className={`w-full transition-all duration-300 ${
            isSampleArticle 
              ? 'opacity-60 cursor-not-allowed' 
              : 'group-hover:bg-[var(--healthscan-green)] group-hover:text-white group-hover:border-[var(--healthscan-green)]'
          }`}
        >
          <span>{isSampleArticle ? 'Preview Article' : 'Read on Substack'}</span>
          {!isSampleArticle && <ExternalLink className="w-4 h-4 ml-2" />}
        </Button>
      </CardContent>
    </Card>
  );
}