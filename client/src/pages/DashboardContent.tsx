import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, Copy, Check, Plus, X } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type ContentType = "project" | "case" | "price" | "guide" | "holiday";
type ToneType = "enthusiastic" | "professional" | "casual";

export default function DashboardContent() {
  const [contentType, setContentType] = useState<ContentType>("project");
  const [project, setProject] = useState("超皮秒祛斑");
  const [tone, setTone] = useState<ToneType>("enthusiastic");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [copied, setCopied] = useState(false);

  const generateMutation = trpc.content.generate.useMutation({
    onSuccess: () => {
      toast.success("内容生成成功！");
    },
    onError: (error) => {
      toast.error(`生成失败：${error.message}`);
    },
  });

  const handleGenerate = () => {
    generateMutation.mutate({
      type: contentType,
      project: project || undefined,
      keywords: keywords.length > 0 ? keywords : undefined,
      tone,
    });
  };

  const handleAddKeyword = () => {
    if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
      setKeywords([...keywords, keywordInput.trim()]);
      setKeywordInput("");
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword));
  };

  const handleCopy = () => {
    if (!generateMutation.data) return;
    const fullText = `${generateMutation.data.title}\n\n${generateMutation.data.content}\n\n${generateMutation.data.tags.join(" ")}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    toast.success("已复制到剪贴板");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">内容管理</h1>
          <p className="text-muted-foreground mt-2">
            一键生成小红书爽文，吸引潜在客户
          </p>
        </div>

        {/* 生成器 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              AI 爽文生成器
            </CardTitle>
            <CardDescription>
              自动生成符合小红书风格的医美项目推广文案
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 配置选项 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 内容类型 */}
              <div className="space-y-2">
                <Label>内容类型</Label>
                <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project">项目体验分享</SelectItem>
                    <SelectItem value="case">效果对比展示</SelectItem>
                    <SelectItem value="price">价格揭秘</SelectItem>
                    <SelectItem value="guide">避坑指南</SelectItem>
                    <SelectItem value="holiday">节日营销</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 项目选择 */}
              <div className="space-y-2">
                <Label>医美项目</Label>
                <Select value={project} onValueChange={setProject}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="超皮秒祛斑">超皮秒祛斑</SelectItem>
                    <SelectItem value="水光针">水光针</SelectItem>
                    <SelectItem value="热玛吉">热玛吉</SelectItem>
                    <SelectItem value="冷光美白">冷光美白</SelectItem>
                    <SelectItem value="隐形矫正">隐形矫正</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 语气风格 */}
              <div className="space-y-2">
                <Label>语气风格</Label>
                <Select value={tone} onValueChange={(v) => setTone(v as ToneType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enthusiastic">热情洋溢</SelectItem>
                    <SelectItem value="professional">专业严谨</SelectItem>
                    <SelectItem value="casual">轻松随意</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 关键词 */}
              <div className="space-y-2">
                <Label>关键词（可选）</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="输入关键词"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddKeyword();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleAddKeyword}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {keywords.map((keyword) => (
                      <Badge key={keyword} variant="secondary" className="gap-1">
                        {keyword}
                        <button
                          onClick={() => handleRemoveKeyword(keyword)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 生成按钮 */}
            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
              size="lg"
              className="w-full"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  一键生成爽文
                </>
              )}
            </Button>

            {/* 生成结果 */}
            {generateMutation.data && (
              <div className="space-y-4 pt-4 border-t">
                {/* 标题 */}
                <div>
                  <div className="text-sm font-medium mb-2">标题</div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="font-medium">{generateMutation.data.title}</p>
                  </div>
                </div>

                {/* 正文 */}
                <div>
                  <div className="text-sm font-medium mb-2">正文</div>
                  <Textarea
                    value={generateMutation.data.content}
                    readOnly
                    rows={20}
                    className="font-sans resize-none"
                  />
                </div>

                {/* 标签 */}
                <div>
                  <div className="text-sm font-medium mb-2">话题标签</div>
                  <div className="flex flex-wrap gap-2">
                    {generateMutation.data.tags.map((tag: string, index: number) => (
                      <Badge key={index} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-3 pt-4">
                  <Button onClick={handleCopy} variant="outline" className="flex-1">
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        复制全部
                      </>
                    )}
                  </Button>
                  <Button onClick={handleGenerate} variant="outline" className="flex-1">
                    <Sparkles className="w-4 h-4 mr-2" />
                    重新生成
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 使用说明 */}
        <Card>
          <CardHeader>
            <CardTitle>使用说明</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <ol className="space-y-2">
              <li>选择内容类型：项目体验分享、效果对比、价格揭秘、避坑指南、节日营销</li>
              <li>选择要推广的医美项目：超皮秒祛斑、水光针、热玛吉、冷光美白、隐形矫正</li>
              <li>选择语气风格：热情洋溢、专业严谨、轻松随意</li>
              <li>（可选）添加必须包含的关键词，让内容更贴合需求</li>
              <li>点击"一键生成爽文"，AI 会基于知识库内容自动生成小红书风格文案</li>
              <li>生成后可以点击"复制全部"一键复制到剪贴板，然后粘贴到小红书发布</li>
              <li>如果对生成的内容不满意，可以点击"重新生成"获取新的文案</li>
              <li>建议配合真实的术前术后对比照片，效果更佳</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
