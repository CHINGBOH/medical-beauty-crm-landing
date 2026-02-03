import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { 
  Sparkles, 
  Clock, 
  Shield, 
  Heart, 
  CheckCircle2, 
  Star,
  MessageCircle,
  Phone,
  Calendar
} from "lucide-react";

export default function Home() {
  // SEO 优化
  useEffect(() => {
    // 设置页面标题（30-60字符）
    document.title = "深圳妍美医美门诊部-超皮秒祛斑|水光针|热玛吉|专业医美机构";
    
    // 设置描述信息（50-160字符）
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute('content', '深圳妍美医疗美容门诊部提供专业的超皮秒祛斑、水光针、热玛吉等医美项目。采用先进技术，专业医生团队，为您打造完美肌肤。免费预约咨询，在线 AI 客服 24 小时服务。');
    
    // 设置关键词
    let metaKeywords = document.querySelector('meta[name="keywords"]');
    if (!metaKeywords) {
      metaKeywords = document.createElement('meta');
      metaKeywords.setAttribute('name', 'keywords');
      document.head.appendChild(metaKeywords);
    }
    metaKeywords.setAttribute('content', '深圳医美,妍美医美,超皮秒祛斑,水光针,热玛吉,医美整形,皮肤美容,抽脂塑形,医美门诊部,深圳美容院');
  }, []);

  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    wechat: "",
    interestedServices: ["超皮秒祛斑"] as string[],
    budget: "",
    message: "",
  });

  const createSession = trpc.chat.createSession.useMutation();
  const submitLead = trpc.chat.convertToLead.useMutation();

  // 从 URL 参数获取来源渠道
  const getSourceFromURL = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get("source") || "官网落地页";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.phone) {
      toast.error("请填写姓名和手机号");
      return;
    }

    // 创建临时会话用于提交线索
    try {
      const sessionResult = await createSession.mutateAsync();
      
      await submitLead.mutateAsync({
        sessionId: sessionResult.sessionId,
        ...formData,
      });

      toast.success("提交成功！我们会尽快联系您 💝");
      
      // 重置表单
      setFormData({
        name: "",
        phone: "",
        wechat: "",
        interestedServices: ["超皮秒祛斑"],
        budget: "",
        message: "",
      });
    } catch (error) {
      toast.error("提交失败，请稍后重试");
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50">
      {/* 导航栏 */}
      <nav className="bg-white/80 backdrop-blur-sm border-b border-amber-100 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/yanmei-logo.jpg" alt="深圳妍美" className="h-10 w-10 object-contain" />
              <span className="text-xl font-bold text-amber-800">
                深圳妍美医疗美容门诊部
              </span>
            </div>
            <div className="flex gap-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setLocation("/dashboard/admin")}
                className="text-gray-500 hover:text-amber-600"
              >
                管理
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setLocation("/chat")}
                className="gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                在线咨询
              </Button>
              <Button 
                className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700"
                onClick={() => {
                  document.getElementById("form-section")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <Calendar className="w-4 h-4 mr-2" />
                立即预约
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero 区域 */}
      <section className="container mx-auto px-4 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Badge className="mb-4 bg-amber-100 text-amber-700 hover:bg-amber-200">
              ⭐ 2024 年度推荐项目
            </Badge>
            <h1 className="text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              超皮秒祛斑
              <br />
              <span className="bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                让肌肤重焕光彩
              </span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              采用先进的超皮秒激光技术，精准击碎色素颗粒，温和祛除各类色斑。恢复期短，效果持久，让您轻松拥有净白无瑕的肌肤。
            </p>
            
            <div className="flex flex-wrap gap-4 mb-8">
              <div className="flex items-center gap-2 bg-white px-4 py-3 rounded-full shadow-sm">
                <Clock className="w-5 h-5 text-amber-600" />
                <span className="text-sm font-medium">恢复期 3-5 天</span>
              </div>
              <div className="flex items-center gap-2 bg-white px-4 py-3 rounded-full shadow-sm">
                <Shield className="w-5 h-5 text-amber-600" />
                <span className="text-sm font-medium">安全无创</span>
              </div>
              <div className="flex items-center gap-2 bg-white px-4 py-3 rounded-full shadow-sm">
                <Heart className="w-5 h-5 text-amber-600" />
                <span className="text-sm font-medium">效果持久</span>
              </div>
            </div>

            <div className="flex gap-4">
              <Button 
                size="lg"
                className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-lg px-8"
                onClick={() => {
                  document.getElementById("form-section")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                免费预约面诊
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => setLocation("/chat")}
                className="text-lg px-8 border-amber-300 hover:bg-amber-50"
              >
                <MessageCircle className="w-5 h-5 mr-2" />
                咨询顾问
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="aspect-square bg-gradient-to-br from-amber-200 to-orange-200 rounded-3xl overflow-hidden shadow-2xl">
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <Sparkles className="w-24 h-24 mx-auto mb-4 text-amber-500" />
                  <p className="text-lg">超皮秒祛斑效果展示</p>
                </div>
              </div>
            </div>
            {/* 装饰元素 */}
            <div className="absolute -top-6 -right-6 w-32 h-32 bg-amber-300 rounded-full opacity-20 blur-3xl"></div>
            <div className="absolute -bottom-6 -left-6 w-40 h-40 bg-orange-300 rounded-full opacity-20 blur-3xl"></div>
          </div>
        </div>
      </section>

      {/* 项目优势 */}
      <section className="bg-white py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">为什么选择超皮秒？</h2>
            <p className="text-gray-600 text-lg">四大核心优势，让祛斑更安全更有效</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: <Sparkles className="w-12 h-12 text-amber-600" />,
                title: "精准祛斑",
                desc: "超短脉冲精准击碎色素，不伤周围组织"
              },
              {
                icon: <Clock className="w-12 h-12 text-amber-600" />,
                title: "恢复快速",
                desc: "3-5天恢复期，不影响正常工作生活"
              },
              {
                icon: <Shield className="w-12 h-12 text-amber-600" />,
                title: "安全可靠",
                desc: "FDA认证设备，专业医师操作"
              },
              {
                icon: <Heart className="w-12 h-12 text-amber-600" />,
                title: "效果持久",
                desc: "2-3次治疗，效果可维持数年"
              }
            ].map((item, index) => (
              <Card key={index} className="border-amber-100 hover:shadow-lg transition-shadow">
                <CardContent className="pt-8 text-center">
                  <div className="mb-4 flex justify-center">{item.icon}</div>
                  <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                  <p className="text-gray-600">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 适合人群 */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">适合哪些人群？</h2>
            <p className="text-gray-600 text-lg">如果您有以下困扰，超皮秒是您的理想选择</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              "雀斑、晒斑困扰多年",
              "黄褐斑、妊娠斑难消除",
              "肤色不均、暗沉无光",
              "毛孔粗大、肤质粗糙",
              "想改善肤质提升颜值",
              "追求安全有效的祛斑方案"
            ].map((item, index) => (
              <div key={index} className="flex items-start gap-3 bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                <CheckCircle2 className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                <span className="text-gray-700">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 客户评价 */}
      <section className="bg-gradient-to-br from-amber-50 to-orange-50 py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">客户真实评价</h2>
            <p className="text-gray-600 text-lg">听听她们的变美故事</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                name: "李女士",
                age: "28岁",
                rating: 5,
                content: "做了两次超皮秒，脸上的雀斑淡了很多！恢复也很快，第三天就可以正常化妆了。医生很专业，全程都很温柔。"
              },
              {
                name: "张小姐",
                age: "35岁",
                rating: 5,
                content: "黄褐斑困扰我好多年，试过很多方法都没用。超皮秒真的有效！现在皮肤白净了好多，整个人都年轻了。"
              },
              {
                name: "王女士",
                age: "32岁",
                rating: 5,
                content: "咨询顾问很耐心，解答了我所有疑问。治疗过程不疼，就像橡皮筋弹一下。效果超出预期，强烈推荐！"
              }
            ].map((review, index) => (
              <Card key={index} className="bg-white border-amber-100">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-1 mb-4">
                    {Array.from({ length: review.rating }).map((_, i) => (
                      <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-gray-700 mb-4 leading-relaxed">{review.content}</p>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-amber-300 to-orange-300 rounded-full"></div>
                    <div>
                      <p className="font-semibold">{review.name}</p>
                      <p className="text-sm text-gray-500">{review.age}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 预约表单 */}
      <section id="form-section" className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold mb-4">立即预约免费面诊</h2>
              <p className="text-gray-600 text-lg">
                填写您的信息，专业顾问将在 30 分钟内与您联系
              </p>
            </div>

            <Card className="border-amber-100 shadow-xl">
              <CardContent className="pt-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="name" className="text-base">
                        姓名 <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="请输入您的姓名"
                        className="mt-2 h-12"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone" className="text-base">
                        手机号 <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="请输入您的手机号"
                        className="mt-2 h-12"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="wechat" className="text-base">
                      微信号
                    </Label>
                    <Input
                      id="wechat"
                      value={formData.wechat}
                      onChange={(e) => setFormData({ ...formData, wechat: e.target.value })}
                      placeholder="方便添加您的微信（选填）"
                      className="mt-2 h-12"
                    />
                  </div>

                  <div>
                    <Label htmlFor="budget" className="text-base">
                      预算区间
                    </Label>
                    <Input
                      id="budget"
                      value={formData.budget}
                      onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                      placeholder="如：5000-10000 元（选填）"
                      className="mt-2 h-12"
                    />
                  </div>

                  <div>
                    <Label htmlFor="message" className="text-base">
                      您的需求或疑问
                    </Label>
                    <Textarea
                      id="message"
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      placeholder="告诉我们您的具体需求，我们会为您提供专业建议"
                      className="mt-2 min-h-[120px]"
                    />
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-lg h-14"
                    disabled={submitLead.isPending}
                  >
                    {submitLead.isPending ? "提交中..." : "立即预约"}
                  </Button>

                  <p className="text-center text-sm text-gray-500">
                    提交即表示您同意我们的隐私政策，我们承诺保护您的个人信息
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* 底部 */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src="/yanmei-logo.jpg" alt="深圳妍美" className="h-8 w-8 object-contain" />
                <span className="text-xl font-bold">深圳妍美</span>
              </div>
              <p className="text-gray-400">
                深圳妍美医疗美容门诊部，专注医美领域，为每一位客户提供安全、专业、个性化的美丽解决方案。
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">联系我们</h3>
              <div className="space-y-2 text-gray-400">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <span>400-XXX-XXXX</span>
                </div>
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" />
                  <span>在线咨询：9:00-21:00</span>
                </div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-4">服务时间</h3>
              <p className="text-gray-400">
                周一至周日：9:00 - 21:00
                <br />
                节假日正常营业
              </p>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400 text-sm">
            <p>© 2024 深圳妍美医疗美容门诊部. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
