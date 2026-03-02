export default function HeartPage() {
    return (
        <div className="max-w-7xl mx-auto">
            <div className="mb-12 pl-4">
                <h1 className="text-4xl md:text-5xl font-bold mb-4 flex items-baseline gap-3">
                    <span className="font-noto text-ink">本心</span>
                    <span className="font-serif text-amber italic text-3xl md:text-4xl opacity-90">Heart</span>
                </h1>
                <div className="text-ink/60 max-w-2xl text-lg font-serif space-y-4">
                    <p>于此，点亮我们的本心之火。</p>
                    <p>
                        每一座指引方向的灯塔，都源于一簇坚定的火焰。这里，将是我们共同定义的服务品牌核心。它将是我们的价值观、我们的哲学、我们共同的语言。光晕将由此而生，照亮我们每一个人的内心。
                    </p>
                    <p className="text-ink/40">—— Heart (本心) ，即将燃起</p>
                </div>
            </div>

            <section className="pl-4">
                <div className="mb-6">
                    <h2 className="text-2xl md:text-3xl font-serif text-ink flex items-baseline gap-3">
                        核心价值框架（暂定）
                        <span className="text-amber italic text-lg md:text-xl font-serif opacity-80">Framework</span>
                    </h2>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <article className="rounded-2xl bg-white/40 border border-white/60 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm p-6">
                        <h3 className="text-xl md:text-2xl font-serif text-ink mb-3">核心文化理念</h3>
                        <p className="text-ink/70 text-sm md:text-base leading-relaxed mb-4">
                            我们暂时确定的四项核心文化理念为：
                        </p>
                        <div className="flex flex-wrap gap-3">
                            {["求真", "至善", "尽美", "大爱"].map((value) => (
                                <span
                                    key={value}
                                    className="px-4 py-2 rounded-full text-sm md:text-base font-noto bg-amber/10 text-amber border border-amber/30"
                                >
                                    {value}
                                </span>
                            ))}
                        </div>
                    </article>

                    <article className="rounded-2xl bg-white/40 border border-white/60 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm p-6">
                        <h3 className="text-xl md:text-2xl font-serif text-ink mb-3">内在驱动力与方法论</h3>
                        <p className="text-ink/70 text-sm md:text-base leading-relaxed">
                            实现这一核心追求的内在驱动力与方法论，是通过
                            <span className="text-amber font-medium">智慧</span>
                            和
                            <span className="text-amber font-medium">勇气</span>
                            去追求。
                        </p>
                    </article>
                </div>

                <article className="mt-6 rounded-2xl bg-white/40 border border-white/60 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm p-6 space-y-5">
                    <h3 className="text-xl md:text-2xl font-serif text-ink">“精诚”新诠释：继承与升华</h3>
                    <p className="text-ink/70 text-sm md:text-base leading-relaxed">
                        新的价值框架并非对“精诚”的颠覆，而是继承与升华。我们将其重新诠释为：
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-xl bg-paper/60 border border-white/70 p-4">
                            <div className="text-lg font-noto text-ink mb-2">精</div>
                            <p className="text-sm text-ink/70 leading-relaxed">
                                代表极致的追求与行动，例如“求”“至”“尽”。
                            </p>
                        </div>
                        <div className="rounded-xl bg-paper/60 border border-white/70 p-4">
                            <div className="text-lg font-noto text-ink mb-2">诚</div>
                            <p className="text-sm text-ink/70 leading-relaxed">
                                代表内在的价值与品格，即“真、善、美、爱”。
                            </p>
                        </div>
                    </div>
                    <p className="text-ink/75 text-sm md:text-base leading-relaxed">
                        “精诚服务”将从一个相对静态的描述，升维为一个动态的、充满哲学思辨和行动力量的价值体系：以精益求精的行动，去践行真诚、善良、美好与博爱的服务信仰。
                    </p>
                </article>
            </section>
        </div>
    );
}
