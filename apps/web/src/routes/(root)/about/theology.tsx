import type { JSX } from 'solid-js';
import A from '~/components/content/a';
import H1 from '~/components/content/h1';
import H2 from '~/components/content/h2';
import H3 from '~/components/content/h3';
import H4 from '~/components/content/h4';
import P from '~/components/content/p';

function DecimalList(props: Omit<JSX.IntrinsicElements['ol'], 'class'>) {
  return <ol class="ml-6 mt-4 list-decimal" {...props} />;
}

export default function TermsRoute() {
  return (
    <div class="bg-white px-6 py-3 lg:px-8">
      <div class="mx-auto max-w-3xl text-base leading-7 text-gray-700">
        <H1>Statement of Theology</H1>
        <P>
          We affirm and subscribe to the following historic and contemporary
          creeds, confessions, and statements of faith (hereafter,
          "statements"). All users are expected to likewise subscribe to these
          statements. If you see any content or comments which are not in
          alignment with these statements please reach out to{' '}
          <A href="&#109;&#097;&#105;&#108;&#116;&#111;&#058;c&#111;&#110;&#116;a&#99;&#116;&#64;l&#101;t&#115;&#46;&#99;&#104;u&#114;&#99;h">
            c&#111;&#110;&#116;&#97;ct&#64;l&#101;ts.&#99;hu&#114;&#99;&#104;
          </A>
          .
        </P>
        <P>
          We reserve the right to update this page as the need arises at our
          discretion. When we do, we will revise the updated date at the bottom
          of this page and send you an email to notify you. We may also provide
          notice to you in other ways at our discretion, such as through the
          contact information you have provided.
        </P>
        <div>
          <H3>Table of contents</H3>
          <ol class="mt-4 max-w-xl space-y-2 text-gray-600">
            <li>
              <A href="#apostles-creed">The Apostles' Creed</A>
            </li>
            <li>
              <A href="#nicene-creed">The Nicene Creed</A>
            </li>
            <li>
              <A href="#chalcedonian-creed">The Chalcedonian Creed</A>
            </li>
            <li>
              <A href="#athanasian-creed">The Athanasian Creed</A>
            </li>
            <li>
              <A href="#five-solas">
                The Five Solas of the Protestant Reformation
              </A>
            </li>
            <li>
              <A href="#chicago-statement">
                The Chicago Statement on Biblical Inerrancy
              </A>
            </li>
          </ol>
        </div>
        <H2 id="apostles-creed">The Apostles' Creed</H2>
        <P>
          I believe in God the Father Almighty, Maker of heaven and earth. And
          in Jesus Christ, His only Son, our Lord; who was conceived by the Holy
          Ghost, born of the Virgin Mary; suffered under Pontius Pilate, was
          crucified, dead, and buried; He descended into hell; the third day He
          rose again from the dead; He ascended into heaven, and sitteth on the
          right hand of God the Father Almighty; from thence He shall come to
          judge the quick and the dead. I believe in the Holy Ghost; the holy{' '}
          <A href="#ac-catholic-note">catholic*</A> Church, the communion of
          saints; the forgiveness of sins; the resurrection of the body; and the
          life everlasting. Amen.
        </P>
        <aside class="mt-4">
          <ol>
            <li id="ac-catholic-note">
              <small>
                * catholic means "universal" and is not a reference to the Roman
                Catholic Church.{' '}
                <A
                  href="#apostles-creed"
                  aria-label="Back to Apostles' Creed"
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore: this role is valid
                  role="doc-backlink"
                >
                  ↩
                </A>
              </small>
            </li>
          </ol>
        </aside>
        <H2 id="nicene-creed">The Nicene Creed</H2>
        <P>
          I believe in one God the Father Almighty; Maker of heaven and earth,
          and of all things visible and invisible.
        </P>
        <P>
          And in one Lord Jesus Christ, the only-begotten Son of God, begotten
          of the Father before all worlds, God of God, Light of Light, very God
          of very God, begotten, not made, being of one substance with the
          Father; by whom all things were made; who, for us men and for our
          salvation, came down from heaven, and was incarnate by the Holy Spirit
          of the Virgin Mary, and was made man; and was crucified also for us
          under Pontius Pilate; He suffered and was buried; and the third day he
          rose again, according to the Scriptures; and ascended into heaven, and
          sitteth on the right hand of the Father; and He shall come again, with
          glory, to judge both the quick and the dead; whose kingdom shall have
          no end.
        </P>
        <P>
          And in the Holy Spirit, the Lord and Giver of Life; who proceedeth
          from the Father and the Son; who with the Father and the Son together
          is worshiped and glorified; who spake by the Prophets. And one holy{' '}
          <A href="#nc-catholic-note">catholic*</A> and apostolic church. I
          acknowledge one baptism for the remission of sins; and I look for the
          resurrection of the dead, and the life of the world to come. Amen.
        </P>
        <aside class="mt-4">
          <ol>
            <li id="nc-catholic-note">
              <small>
                * catholic means "universal" and is not a reference to the Roman
                Catholic Church.{' '}
                <A
                  href="#nicene-creed"
                  aria-label="Back to Nicene Creed"
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore: this role is valid
                  role="doc-backlink"
                >
                  ↩
                </A>
              </small>
            </li>
          </ol>
        </aside>
        <H2 id="#chalcedonian-creed">The Chalcedonian Creed</H2>
        <P>
          We then, following the holy Fathers, all with one consent, teach men
          to confess one and the same Son, our Lord Jesus Christ, the same
          perfect in Godhead and also perfect in manhood; truly God and truly
          man, of a reasonable soul and body; consubstantial with the Father
          according to the Godhead, and consubstantial with us according to the
          Manhood; in all things like unto us, without sin; begotten before all
          ages of the Father according to the Godhead, and in these latter days,
          for us and for our salvation, born of the Virgin Mary, the Mother of
          God, according to the Manhood; one and the same Christ, Son, Lord,
          Only-begotten, to be acknowledged in two natures, inconfusedly,
          unchangeably, indivisibly, inseparably; the distinction of natures
          being by no means taken away by the union, but rather the property of
          each nature being preserved, and concurring in one Person and one
          Subsistence, not parted or divided into two persons, but one and the
          same Son, and only begotten, God the Word, the Lord Jesus Christ, as
          the prophets from the beginning have declared concerning him, and the
          Lord Jesus Christ himself has taught us, and the Creed of the holy
          Fathers handed down to us.
        </P>
        <H2 id="athanasian-creed">The Athanasian Creed</H2>
        <DecimalList>
          <li>
            Whosoever will be saved: before all things it is necessary that he
            hold the <A href="#athc-catholic-note">catholic*</A> Faith:
          </li>
          <li>
            Which Faith except every one do keep whole and undefiled: without
            doubt he shall perish everlastingly.
          </li>
          <li>
            And the <A href="#athc-catholic-note">catholic*</A> Faith is this:
            That we worship one God in Trinity, and Trinity in Unity;
          </li>
          <li>Neither confounding the Persons: nor dividing the Substance.</li>
          <li>
            For there is one Person of the Father: another of the Son: and
            another of the Holy Spirit.
          </li>
          <li>
            But the Godhead of the Father, of the Son, and of the Holy Spirit,
            is all one: the Glory equal, the Majesty coeternal.
          </li>
          <li>
            Such as the Father is: such is the Son: and such is the Holy Spirit.
          </li>
          <li>
            The Father uncreated: the Son uncreated: and the Holy Spirit
            uncreated.
          </li>
          <li>
            The Father incomprehensible: the Son incomprehensible: and the Holy
            Spirit incomprehensible.
          </li>
          <li>
            The Father eternal: the Son eternal: and the Holy Spirit eternal.
          </li>
          <li>And yet they are not three eternals: but one eternal.</li>
          <li>
            And also there are not three uncreated: nor three incomprehensibles,
            but one uncreated: and one incomprehensible.
          </li>
          <li>
            So likewise the Father is Almighty: the Son Almighty: and the Holy
            Spirit Almighty.
          </li>
          <li>And yet they are not three Almighties: but one Almighty.</li>
          <li>
            So the Father is God: the Son is God: and the Holy Spirit is God.
          </li>
          <li>And yet they are not three Gods: but one God.</li>
          <li>
            So likewise the Father is Lord: the Son Lord: and the Holy Spirit
            Lord.
          </li>
          <li>And yet not three Lords: but one Lord:</li>
          <li>
            For like as we are compelled by the Christian verity: to acknowledge
            every Person by himself to be God and Lord:
          </li>
          <li>
            So are we forbidden by the{' '}
            <A href="#athc-catholic-note">catholic*</A> Religion: to say, There
            be three Gods, or three Lords.
          </li>
          <li>The Father is made of none: neither created, nor begotten.</li>
          <li>
            The Son is of the Father alone: not made, nor created: but begotten.
          </li>
          <li>
            The Holy Spirit is of the Father and of the Son: neither made, nor
            created, nor begotten: but proceeding.
          </li>
          <li>
            So there is one Father, not three Fathers: one Son, not three Sons:
            one Holy Spirit, not three Holy Spirits.
          </li>
          <li>
            And in this Trinity none is afore, or after another: none is
            greater, or less than another.
          </li>
          <li>But the whole three Persons are coeternal, and coequal.</li>
          <li>
            So that in all things, as aforesaid: the Unity in Trinity, and the
            Trinity in Unity, is to be worshipped.
          </li>
          <li>
            He therefore that will be saved, must thus think of the Trinity.
          </li>
          <li>
            Furthermore it is necessary to everlasting salvation: that he also
            believe rightly the Incarnation of our Lord Jesus Christ.
          </li>
          <li>
            For the right Faith is, that we believe and confess: that our Lord
            Jesus Christ, the Son of God, is God and Man.
          </li>
          <li>
            God, of the Substance of the Father; begotten before the worlds: and
            Man, of the Substance of His Mother, born into the world.
          </li>
          <li>
            Perfect God: and perfect Man, of a reasonable soul and human flesh
            subsisting.
          </li>
          <li>
            Equal to the Father, as touching His Godhead: and inferior to the
            Father as touching His Manhood.
          </li>
          <li>
            Who although He be God and Man; yet He is not two, but one Christ.
          </li>
          <li>
            One; not by conversion of the Godhead into flesh: but by taking of
            the Manhood into God.
          </li>
          <li>
            One altogether; not by confusion of Substance: but by unity of
            Person.
          </li>
          <li>
            For as the reasonable soul and flesh is one man; so God and Man is
            one Christ;
          </li>
          <li>
            Who suffered for our salvation: descended into hell: rose again the
            third day from the dead.
          </li>
          <li>
            He ascended into heaven, He sitteth on the right hand of the Father
            God Almighty.
          </li>
          <li>From whence He shall come to judge the quick and the dead.</li>
          <li>At whose coming all men shall rise again with their bodies;</li>
          <li>And shall give account for their own works.</li>
          <li>
            And they that have done good shall go into life everlasting: and
            they that have done evil, into everlasting fire.
          </li>
          <li>
            This is the <A href="#athc-catholic-note">catholic*</A> Faith: which
            except a man believe faithfully, he can not be saved.
          </li>
        </DecimalList>
        <aside class="mt-4">
          <ol>
            <li id="athc-catholic-note">
              <small>
                * catholic means "universal" and is not a reference to the Roman
                Catholic Church.{' '}
                <A
                  href="#athanasian-creed"
                  aria-label="Back to Athanasian Creed"
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore: this role is valid
                  role="doc-backlink"
                >
                  ↩
                </A>
              </small>
            </li>
          </ol>
        </aside>
        <H2 id="five-solas">The Five Solas of the Protestant Reformation</H2>
        <DecimalList>
          <li>
            <strong>Sola Scriptura</strong> - Scripture alone is the ultimate
            authority for Christian faith and practice, not tradition or the
            teachings of the church.
          </li>
          <li>
            <strong>Sola Fide</strong> - Justification is by faith alone, and
            not by good works or any merit of our own.
          </li>
          <li>
            <strong>Sola Gratia</strong> - Salvation is by grace alone, and not
            by any merit or worthiness on our part.
          </li>
          <li>
            <strong>Solus Christus</strong> - Salvation is found in Christ
            alone, and not in any other person or religious system.
          </li>
          <li>
            <strong>Soli Deo Gloria</strong> - All glory and honor belongs to
            God alone, and not to any human or created thing.
          </li>
        </DecimalList>
        <H2 id="chicago-statement">
          The Chicago Statement on Biblical Inerrancy
        </H2>
        <H3>Preface</H3>
        <P>
          The authority of Scripture is a key issue for the Christian Church in
          this and every age. Those who profess faith in Jesus Christ as Lord
          and Savior are called to show the reality of their discipleship by
          humbly and faithfully obeying God’s written Word. To stray from
          Scripture in faith or conduct is disloyalty to our Master. Recognition
          of the total truth and trustworthiness of Holy Scripture is essential
          to a full grasp and adequate confession of its authority.
        </P>
        <P>
          The following Statement affirms this inerrancy of Scripture afresh,
          making clear our understanding of it and warning against its denial.
          We are persuaded that to deny it is to set aside the witness of Jesus
          Christ and of the Holy Spirit and to refuse that submission to the
          claims of God’s own Word which marks true Christian faith. We see it
          as our timely duty to make this affirmation in the face of current
          lapses from the truth of inerrancy among our fellow Christians and
          misunderstanding of this doctrine in the world at large.
        </P>
        <P>
          This Statement consists of three parts: a Summary Statement, Articles
          of Affirmation and Denial, and an accompanying Exposition. It has been
          prepared in the course of a three-day consultation in Chicago. Those
          who have signed the Summary Statement and the Articles wish to affirm
          their own conviction as to the inerrancy of Scripture and to encourage
          and challenge one another and all Christians to growing appreciation
          and understanding of this doctrine. We acknowledge the limitations of
          a document prepared in a brief, intensive conference and do not
          propose that Statement be given credal weight. Yet we rejoice in the
          deepening of our own convictions through our discussions together, and
          we pray that the Statement we have signed may be used to the glory of
          our God toward a new reformation of the Church in its faith, life and
          mission.
        </P>
        <P>
          We offer this Statement in a spirit, not of contention, but of
          humility and love, which we by God’s grace to maintain in any future
          dialoge arising out of what we have said. We gladly acknowledge that
          many who deny the inerrancy of Scripture do not display the
          consequences of this denial in the rest of their belief and behaviour,
          and we are conscious that we who confess this doctrine often deny it
          in life by failing to bring our thoughts and deeds, our traditions and
          habits, into true subjection to the divine Word.
        </P>
        <P>
          We invite response to this statement from who see reason to amend its
          affirmations about Scripture by the light of Scripture itself, under
          whose infallible authority we stand as we speak. We claim no personal
          infallibility for the witness we bear, and for any help which enables
          us to strengthen this testimony to God’s Word we shall be grateful.
        </P>
        <H3>A Short Statement</H3>
        <DecimalList>
          <li>
            God, who is Himself Truth and speaks truth only, has inspired Holy
            Scripture in order thereby to reveal Himself to lost mankind through
            Jesus Christ as Creator and Lord, Redeemer and Judge. Holy Scripture
            is God’s witness to Himself.
          </li>
          <li>
            Holy Scripture, being God’s own Word, written by men prepared and
            superintended by His Spirit, is of infallible divine authority in
            all matters upon which it touches: it is to be believed, as God’s
            instruction, in all that it affirms; obeyed, as God’s command, in
            all that it requires; embraced, as God’s pledge, in all that it
            promises.
          </li>
          <li>
            The Holy Spirit, Scripture’s divine Author, both authenticates it to
            us by His inward witness and opens our minds to understand its
            meaning.
          </li>
          <li>
            Being wholly and verbally God-given, Scripture is without error or
            fault in all its teaching, no less in what it states about God’s
            acts in creation, about the events of world history, and about its
            own literary origins under God, than in its witness to God’s saving
            grace in individual lives.
          </li>
          <li>
            The authority of Scripture is inescapably impaired if this total
            divine inerrancy is in any way limited or disregarded, or made
            relative to a view of truth contrary to the Bible’s own; and such
            lapses bring serious loss to both the individual and the Church.
          </li>
        </DecimalList>
        <H3>Articles of Affirmation and Denial</H3>
        <H4>Article I</H4>
        <P>
          We affirm that the Holy Scriptures are to be received as the
          authoritative Word of God. We deny that the Scriptures receive their
          authority from the Church, tradition, or any other human service.
        </P>
        <H4>Article II</H4>
        <P>
          We affirm that the Scriptures are the supreme written norm by which
          God binds the conscience, and that the authority of the Church is
          subordinate to that of Scripture.
        </P>
        <P>
          We deny that Church creeds, councils, or declarations have authority
          greater than or equal to the authority of the Bible.
        </P>
        <H4>Article III</H4>
        <P>
          We affirm that the written Word in its entirety is revelation given by
          God.
        </P>
        <P>
          We deny that the Bible is merely a witness to revelation, or only
          becomes revelation in encounter, or depends on the responses of men
          for its validity.
        </P>
        <H4>Article IV</H4>
        <P>
          We affirm that God who made mankind in His image has used language as
          a means of revelation. We deny that human language is so limited by
          our creatureliness that it is rendered inadequate as a vehicle for
          divine revelation. We further deny that the corruption of human
          culture and language through sin has thwarted God’s work of
          inspiration.
        </P>
        <H4>Article V</H4>
        <P>
          We affirm that God’s revelation within the Holy Scriptures was
          progressive.
        </P>
        <P>
          We deny that later revelation, which may fulfill earlier revelation,
          ever corrects or contradicts it. We further deny that any normative
          revelation has been given since the completion of the New Testament
          writings.
        </P>
        <H4>Article VI</H4>
        <P>
          We affirm that the whole of Scripture and all its parts, down to the
          very words of the original, were given by divine inspiration. We deny
          that the inspiration of Scripture can rightly be affirmed of the whole
          without the parts, or of some parts but not the whole.
        </P>
        <H4>Article VII</H4>
        <P>
          We affirm that inspiration was the work in which God by His Spirit,
          through human writers, gave us His Word. The origin of Scripture is
          divine. The mode of divine inspiration remains largely a mystery to
          us.
        </P>
        <P>
          We deny that inspiration can be reduced to human insight, or to
          heightened states of consciousness of any kind.
        </P>
        <H4>Article VIII</H4>
        <P>
          We affirm that God in His work of inspiration utilized the distinctive
          personalities and literary styles of the writers whom He had chosen
          and prepared.
        </P>
        <P>
          We deny that God, in causing these writers to use the very words that
          He chose, overrode their personalities.
        </P>
        <H4>Article IX</H4>
        <P>
          We affirm that inspiration, though not conferring omniscience,
          guaranteed true and trustworthy utterance on all matters of which the
          Biblical authors were moved to speak and write.
        </P>
        <P>
          We deny that the finitude of fallenness of these writers, by necessity
          or otherwise, introduced distortion or falsehood into God’s Word.
        </P>
        <H4>Article X</H4>
        <P>
          We affirm that inspiration, strictly speaking, applies only to the
          autographic text of Scripture, which in the providence of God can be
          ascertained from available manuscripts with great accuracy. We further
          affirm that copies and translations of Scripture are the Word of God
          to the extent that they faithfully represent the original.
        </P>
        <P>
          We deny that any essential element of the Christian faith is affected
          by the absence of the autographs. We further deny that this absence
          renders the assertion of Biblical inerrancy invalid or irrelevant.
        </P>
        <H4>Article XI</H4>
        <P>
          We affirm that Scripture, having been given by divine inspiration, is
          infallible, so that, far from misleading us, it is true and reliable
          in all the matters it addresses.
        </P>
        <P>
          We deny that it is possible for the Bible to be at the same time
          infallible and errant in its assertions. Infallibility and inerrancy
          may be distinguished, but not separated.
        </P>
        <H4>Article XII</H4>
        <P>
          We affirm that Scripture in its entirety is inerrant, being free from
          all falsehood, fraud, or deceit.
        </P>
        <P>
          We deny that Biblical infallibility and inerrancy are limited to
          spiritual, religious, or redemptive themes, exclusive of assertions in
          the fields of history and science. We further deny that scientific
          hypotheses about earth history may properly be used to overturn the
          teaching of Scripture on creation and the flood.
        </P>
        <H4>Article XIII</H4>
        <P>
          We affirm the propriety of using inerrancy as a theological term with
          reference to the complete truthfulness of Scripture.
        </P>
        <P>
          We deny that it is proper to evaluate Scripture according to standards
          of truth and error that are alien to its usage or purpose. We further
          deny that inerrancy is negated by Biblical phenomena such as a lack of
          modern technical precision, irregularities of grammar or spelling,
          observational descriptions of nature, the reporting of falsehoods, the
          use of hyperbole and round numbers, the topical arrangement of
          material, variant selections of material in parallel accounts, or the
          use of free citations.
        </P>
        <H4>Article XIV</H4>
        <P>We affirm the unity and internal consistency of Scripture.</P>
        <P>
          We deny that alleged errors and discrepancies that have not yet been
          resolved vitiate the truth claims of the Bible.
        </P>
        <H4>Article XV</H4>
        <P>
          We affirm that the doctrine of inerrancy is ground in the teaching of
          the Bible about inspiration.
        </P>
        <P>
          We deny that Jesus’ teaching about Scripture may be dismissed by
          appeals to accommodation or to any natural limitation of His humanity.
        </P>
        <H4>Article XVI</H4>
        <P>
          We affirm that the doctrine of inerrancy has been integral to the
          Church’s faith throughout its history.
        </P>
        <P>
          We deny that inerrancy is a doctrine invented by scholastic
          Protestantism, or is a reactionary position postulated in response to
          negative higher criticism.
        </P>
        <H4>Article XVII</H4>
        <P>
          We affirm that the Holy Spirit bears witness to the Scriptures,
          assuring believers of the truthfulness of God’s written Word.
        </P>
        <P>
          We deny that this witness of the Holy Spirit operates in isolation
          from or against Scripture.
        </P>
        <H4>Article XVIII</H4>
        <P>
          We affirm that the text of Scripture is to be interpreted by
          grammatico-historical exegesis, taking account of its literary forms
          and devices, and that Scripture is to interpret Scripture.
        </P>
        <P>
          We deny the legitimacy of any treatment of the text or quest for
          sources lying behind it that leads to relativizing, dehistoricizing,
          or discounting its teaching, or rejecting its claims to authorship.
        </P>
        <H4>Article XIX</H4>
        <P>
          We affirm that a confession of the full authority, infallibility, and
          inerrancy of Scripture is vital to a sound understanding of the whole
          of the Christian faith. We further affirm that such confession should
          lead to increasing conformity to the image of Christ.
        </P>
        <P>
          We deny that such confession is necessary for salvation. However, we
          further deny that inerrancy can be rejected without grave
          consequences, both to the individual and to the Church.
        </P>
        <P>
          <small>This document was last updated on May 3, 2023</small>
        </P>
      </div>
    </div>
  );
}
