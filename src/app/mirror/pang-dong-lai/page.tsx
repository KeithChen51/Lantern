
"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Clock, User, Quote, Heart, ShoppingBag, MapPin } from "lucide-react";

export default function PangDongLaiPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 pb-20 relative animate-in fade-in duration-700">

      {/* 顶部返回导航 */}
      <div className="mb-8 pt-4">
        <Link
          href="/"
          className="inline-flex items-center text-ink/40 hover:text-amber transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
          <span className="font-serif">Back to Mirror</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* 左侧：粘性目录导航 (只在桌面端显示) */}
        <aside className="hidden lg:block lg:col-span-3 relative">
          <div className="sticky top-32 space-y-8">
            <div className="space-y-1">
              <div className="text-xs font-bold uppercase tracking-widest text-amber mb-4">Table of Contents</div>
              <nav className="flex flex-col space-y-3 text-sm font-medium text-ink/40">
                <TOCLink href="#overview" label="企业概况" />
                <TOCLink href="#model" label="商业模式" />
                <TOCLink href="#culture" label="自由·爱" />
                <TOCLink href="#impact" label="市场影响" />
                <TOCLink href="#future" label="未来挑战" />
                <TOCLink href="#conclusion" label="Conclusion" />
              </nav>
            </div>

            {/* 侧边栏装饰 */}
            <div className="p-4 bg-amber/5 rounded-lg border border-amber/10">
              <div className="text-xs text-amber/80 font-serif italic mb-2">Quote of the day</div>
              <p className="text-xs text-ink/60 leading-relaxed">
                “让更多人看到美好的样子，让生命变得更加美好。”
              </p>
            </div>
          </div>
        </aside>

        {/* 右侧：主要内容 */}
        <main className="lg:col-span-9">

          {/* 头部区域 */}
          <header className="mb-16">
            <h1 className="text-4xl md:text-5xl font-bold mb-6 text-ink font-noto leading-tight">
              云游胖东来
            </h1>
            <p className="text-xl md:text-2xl font-serif text-amber italic mb-8 opacity-90">
              深入一家区域零售企业的商业哲学与人文关怀
            </p>

            <div className="flex items-center gap-6 text-sm text-ink/40 font-sans uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" />
                <span>Manus AI</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>2025年12月26日</span>
              </div>
            </div>
          </header>

          {/* 摘要 */}
          <section className="mb-20 bg-white/40 border border-white/60 rounded-2xl p-8 backdrop-blur-sm shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-amber mb-4">Abstract</h2>
            <p className="text-ink/80 leading-relaxed font-serif text-lg">
              胖东来商贸集团有限公司，一家源自河南许昌的区域性零售企业，近年来已成为中国零售行业一个现象级的存在。本报告旨在全面、深入地调研胖东来，剖析其独特的商业模式、卓越的企业文化、领先的市场地位及其对整个行业的深远影响。
            </p>
            <div className="mt-6 pt-6 border-t border-ink/5">
              <p className="text-ink/80 leading-relaxed font-serif text-lg">
                研究发现，胖东来的成功并非偶然，而是其创始人于东来先生“自由·爱”的经营哲学与一套独特的“以人为本”管理体系相结合的必然结果。即使在“神话”光环之下，它也面临着模式可复制性等挑战。
              </p>
            </div>
          </section>

          {/* 1. 企业概况 */}
          <ContentSection id="overview" number="01" title="企业概况">
            <p className="mb-8 text-ink/70 leading-relaxed">
              胖东来由创始人于东来先生于1995年在河南许昌创立，从一家街边小店起步，发展至今已成为在许昌、新乡两地拥有13家门店的大型商贸集团。
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <StatCard label="2025年销售额" value="200.35" unit="亿元" trend="提前达成目标" />
              <StatCard label="2024年利润" value="8+" unit="亿元" />
              <StatCard label="2024年税收" value="6+" unit="亿元" />
              <StatCard label="员工平均月收" value="9000+" unit="元" />
              <StatCard label="门店数量" value="13" unit="家" sub="许昌/新乡" />
              <StatCard label="员工总数" value="10000+" unit="人" />
            </div>

            <p className="text-sm text-ink/40 text-right italic font-serif">
              *数据来源：新华网、21世纪经济报道等公开信息 (2024-2025)
            </p>
          </ContentSection>

          {/* 2. 商业模式 */}
          <ContentSection id="model" number="02" title="商业模式">
            <p className="mb-8 text-ink/70 leading-relaxed">
              与传统零售企业不同，胖东来的商业模式并非单纯依赖商品销售，而是一种<strong>“超市业态引流 + 商业地产变现”</strong>的复合模式。
            </p>

            <div className="grid md:grid-cols-2 gap-8">
              <FeatureBlock
                icon={<ShoppingBag className="w-6 h-6 text-amber" />}
                title="流量引擎：极致超市"
              >
                <ul className="space-y-3 text-ink/70 text-sm leading-relaxed list-disc list-outside pl-4">
                  <li><strong>低毛利引流：</strong>超市毛利率仅20%左右，部分商品零利润，锁定海量客流。</li>
                  <li><strong>自有品牌(DL)：</strong>精酿啤酒、烘焙产品等爆款，高质价比，增强粘性。</li>
                  <li><strong>中央厨房：</strong>投资5.7亿元建设，确保生鲜熟食高品质供应。</li>
                </ul>
              </FeatureBlock>

              <FeatureBlock
                icon={<MapPin className="w-6 h-6 text-amber" />}
                title="价值变现：商业地产"
              >
                <ul className="space-y-3 text-ink/70 text-sm leading-relaxed list-disc list-outside pl-4">
                  <li><strong>自持物业：</strong>门店多位于自营购物中心，客流带动地产增值。</li>
                  <li><strong>高额租金：</strong>铺位租金水平可媲美一线城市核心商圈。</li>
                  <li><strong>自营高利业态：</strong>珠宝、茶叶、高端电子等高利润品类直接自营，利润最大化。</li>
                </ul>
              </FeatureBlock>
            </div>
          </ContentSection>

          {/* 3. 企业文化 */}
          <ContentSection id="culture" number="03" title="自由·爱">
            <div className="relative p-10 bg-amber/5 rounded-2xl mb-12 border border-amber/10">
              <Quote className="absolute top-6 left-6 w-8 h-8 text-amber/20" />
              <blockquote className="relative z-10 text-xl font-serif text-ink italic text-center max-w-3xl mx-auto leading-relaxed">
                “有的人说胖东来是神话，其实就是真诚了一点、善良了一点，如果这样都被说是神话，那我们过得多悲哀啊！”
              </blockquote>
              <div className="mt-6 text-center text-sm font-bold text-amber uppercase tracking-widest">
                — 于东来
              </div>
            </div>

            <h3 className="text-xl font-bold font-noto mb-6 flex items-center gap-3">
              <Heart className="w-5 h-5 text-amber" />
              员工关怀体系
            </h3>

            <div className="grid sm:grid-cols-2 gap-4">
              <WelfareCard title="高薪酬" content="税后平均月收入超9000元，管理层年均分配达70万元。" />
              <WelfareCard title="利润分享" content="实行“三三三”原则，30%利润用于员工分红。" />
              <WelfareCard title="超长假期" content="年假40天(含10天不需要理由的“不开心假”)，周二闭店。" />
              <WelfareCard title="委屈奖" content="员工受不公对待可获高额补偿 (5000-8000元)。" />
              <WelfareCard title="全家保障" content="提供覆盖全家的医疗保险及大病救助。" />
              <WelfareCard title="民主评议" content="满意度低于80%的管理层需接受评议，体现真正的尊重。" />
            </div>
          </ContentSection>

          {/* 4. 市场影响 */}
          <ContentSection id="impact" number="04" title="市场影响">
            <div className="space-y-8">
              <div className="p-6 bg-white/60 rounded-xl border border-white/50 hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold font-noto mb-3 text-ink">零售界的海底捞</h3>
                <p className="text-ink/70 leading-relaxed mb-4">
                  被誉为“没有淡季的6A级景区”，成为全国消费打卡地。其“不满意就退货”、免费代驾等服务已成为行业范本。
                </p>
                <div className="flex gap-2">
                  <span className="px-3 py-1 bg-ink/5 rounded-full text-xs text-ink/60">#文旅效应</span>
                  <span className="px-3 py-1 bg-ink/5 rounded-full text-xs text-ink/60">#服务标杆</span>
                </div>
              </div>

              <div className="p-6 bg-white/60 rounded-xl border border-white/50 hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold font-noto mb-3 text-ink">帮扶同行：从竞争到赋能</h3>
                <p className="text-ink/70 leading-relaxed mb-4">
                  2024年起，启动对步步高、永辉、物美等传统商超的“帮扶调改”。打破零和博弈，输出管理理念与供应链。
                </p>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="bg-green-50/50 p-3 rounded-lg border border-green-100">
                    <div className="text-green-700 font-bold text-sm mb-1">永辉郑州</div>
                    <div className="text-xs text-green-600">首日销售增长超5倍</div>
                  </div>
                  <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                    <div className="text-blue-700 font-bold text-sm mb-1">步步高</div>
                    <div className="text-xs text-blue-600">成功撤销退市风险警示</div>
                  </div>
                </div>
              </div>
            </div>
          </ContentSection>

          {/* 5. 未来展望 */}
          <ContentSection id="future" number="05" title="未来挑战">
            <div className="grid gap-6">
              <ChallengeCard
                title="扩张悖论"
                desc="出于对服务质量的保护，主动关闭部分盈利门店。高度依赖创始人理念，跨地域扩张困难。"
              />
              <ChallengeCard
                title="模式可持续性"
                desc="高昂人力成本与重资产模式，在电商与仓储会员店(如Sam's)双重夹击下的长期挑战。"
              />
              <ChallengeCard
                title="数字化融合"
                desc="与多点DMALL合作推进数字化。探索'理念+品牌'的轻资产输出路径。"
              />
            </div>
          </ContentSection>

          {/* 6. 结论 */}
          <section id="conclusion" className="mb-20 pt-10 border-t border-amber/20 text-center scroll-mt-32">
            <div className="w-16 h-1 bg-amber mx-auto mb-8 rounded-full opacity-50" />
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-ink mb-6">
              Conclusion
            </h2>
            <p className="text-xl leading-relaxed font-noto text-ink/80 max-w-3xl mx-auto mb-8">
              胖东来证明了商业成功可以建立在对人的真诚与关爱之上。其“人本经营”哲学为中国零售业提供了一面镜子。
            </p>
            <p className="text-ink/50 italic font-serif">
              —— 照亮前行的方向
            </p>
          </section>

          {/* 参考文案 */}
          <footer className="border-t border-ink/5 pt-12 text-ink/40 text-sm">
            <h4 className="uppercase tracking-widest font-bold mb-6 text-xs text-ink/20">References</h4>
            <ul className="space-y-2 font-mono text-xs">
              <li>[1] 新华网. (2024). 《何以胖东来——一家“网红”商超的坚守与嬗变》</li>
              <li>[2] 新华网. (2025). 《胖东来提前50多天完成200亿元目标》</li>
              <li>[3] 虎嗅网. (2024). 《胖东来真正的商业模式是什么？》</li>
              <li>[4] 中金公司. (2025). 《何以胖东来？人本经营造就幸福生产力》</li>
              <li>[5] 新浪财经. (2024). 《独家专访胖东来创始人》</li>
            </ul>
          </footer>
        </main>
      </div>
    </div>
  );
}

// 子组件定义
function TOCLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="block py-1 hover:text-amber hover:pl-2 transition-all duration-300 border-l-2 border-transparent hover:border-amber pl-3 -ml-3"
    >
      {label}
    </a>
  );
}

function ContentSection({ id, number, title, children }: { id?: string; number: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-24 relative scroll-mt-32">
      <div className="flex items-baseline gap-4 mb-8 pb-4 border-b border-ink/10">
        <span className="font-serif text-5xl text-amber/20 font-bold">{number}</span>
        <h2 className="text-2xl font-bold font-noto text-ink">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  );
}

function StatCard({ label, value, unit, trend, sub }: { label: string; value: string; unit: string; trend?: string, sub?: string }) {
  return (
    <div className="p-6 bg-white/40 rounded-xl border border-white/50 backdrop-blur-[1px] hover:bg-white/60 transition-colors group">
      <div className="text-ink/40 text-sm mb-2 font-medium uppercase tracking-wider">{label}</div>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-3xl font-bold text-ink font-serif group-hover:text-amber transition-colors">{value}</span>
        <span className="text-sm text-ink/60">{unit}</span>
      </div>
      {(trend || sub) && (
        <div className="text-xs font-medium px-2 py-1 bg-amber/10 text-amber/80 rounded inline-block">
          {trend || sub}
        </div>
      )}
    </div>
  );
}

function FeatureBlock({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="p-6 rounded-2xl bg-gradient-to-br from-white/40 to-white/10 border border-white/40 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-amber/10 rounded-lg">{icon}</div>
        <h3 className="font-bold text-lg font-noto">{title}</h3>
      </div>
      <div className="pl-2 border-l-2 border-amber/10">
        {children}
      </div>
    </div>
  );
}

function WelfareCard({ title, content }: { title: string; content: string }) {
  return (
    <div className="p-5 bg-white/30 rounded-lg border border-dashed border-ink/10 hover:border-amber/30 hover:bg-white/50 transition-all">
      <h4 className="font-bold text-amber mb-2 font-noto">{title}</h4>
      <p className="text-sm text-ink/70 leading-relaxed">{content}</p>
    </div>
  );
}

function ChallengeCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="relative group p-6">
      <div className="absolute inset-0 bg-ink/5 rounded-xl -skew-y-1 group-hover:skew-y-0 text-amber transition-transform duration-300"></div>
      <div className="relative bg-white p-6 rounded-xl border border-ink/5 shadow-sm">
        <h4 className="font-serif font-bold text-lg mb-3">{title}</h4>
        <p className="text-sm text-ink/60 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
