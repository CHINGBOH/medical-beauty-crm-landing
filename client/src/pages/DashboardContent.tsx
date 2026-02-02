import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Copy, Check } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { toast } from "sonner";

export default function DashboardContent() {
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<{
    title: string;
    content: string;
    tags: string[];
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    // 模拟生成内容（实际应该调用 LLM API）
    setTimeout(() => {
      setGeneratedContent({
        title: "🌟超皮秒祛斑实录｜3次治疗后我的斑真的淡了！",
        content: `姐妹们！我终于鼓起勇气去做了超皮秒祛斑！💪

📍 选择理由：
深圳妍美医疗美容门诊部，朋友推荐的，医生很专业，设备是进口的蜂巢超皮秒，FDA认证✅

💰 价格：
单次3800元，我做了3次疗程套餐优惠价9800元

😖 疼痛感：
说实话有点疼，但完全能忍受！就像橡皮筋弹脸的感觉，涂了麻药后好很多

⏰ 恢复期：
- 第1天：脸有点红肿，像晒伤
- 第3天：开始结痂（千万别抠！）
- 第7天：痂皮自然脱落，皮肤嫩嫩的
- 第14天：斑明显淡了30%！

✨ 效果：
第一次做完就能看到效果，斑点真的淡了！医生说要3-5次才能完全去除，我现在做完3次，斑淡了70%左右，超满意！

⚠️ 注意事项：
1. 一定要防晒！！！SPF50+每2小时补一次
2. 不要用美白产品，会刺激皮肤
3. 多喝水，多吃维C
4. 不要熬夜，会影响恢复

💡 建议：
如果你也被斑困扰，真的可以试试超皮秒！选择正规医美机构很重要，不要贪便宜去小作坊！

有问题欢迎评论区问我～`,
        tags: ["#超皮秒祛斑", "#医美日记", "#祛斑实录", "#深圳医美", "#医美变美"],
      });
      setGenerating(false);
      toast.success("内容生成成功！");
    }, 2000);
  };

  const handleCopy = () => {
    if (!generatedContent) return;
    const fullText = `${generatedContent.title}\n\n${generatedContent.content}\n\n${generatedContent.tags.join(" ")}`;
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
          <CardContent className="space-y-4">
            <Button
              onClick={handleGenerate}
              disabled={generating}
              size="lg"
              className="w-full"
            >
              {generating ? (
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

            {generatedContent && (
              <div className="space-y-4 pt-4 border-t">
                {/* 标题 */}
                <div>
                  <div className="text-sm font-medium mb-2">标题</div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="font-medium">{generatedContent.title}</p>
                  </div>
                </div>

                {/* 正文 */}
                <div>
                  <div className="text-sm font-medium mb-2">正文</div>
                  <Textarea
                    value={generatedContent.content}
                    readOnly
                    rows={20}
                    className="font-sans resize-none"
                  />
                </div>

                {/* 标签 */}
                <div>
                  <div className="text-sm font-medium mb-2">话题标签</div>
                  <div className="flex flex-wrap gap-2">
                    {generatedContent.tags.map((tag, index) => (
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
              <li>点击"一键生成爽文"按钮，AI 会自动生成一篇小红书风格的医美项目推广文案</li>
              <li>生成的内容包括：吸引眼球的标题、详细的正文、相关话题标签</li>
              <li>可以点击"复制全部"一键复制到剪贴板，然后粘贴到小红书发布</li>
              <li>如果对生成的内容不满意，可以点击"重新生成"获取新的文案</li>
              <li>建议配合真实的术前术后对比照片，效果更佳</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
